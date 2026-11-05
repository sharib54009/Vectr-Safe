"""Server-side check-in expiry and idempotent safety escalation."""
from django.db import transaction
from django.utils import timezone

from journeys.models import Journey
from .models import SafetyAlert, SafetyCheckIn, SafetyIncident, SOS


def _journey_snapshot(journey):
    latest = journey.locations.order_by("-timestamp", "-id").first()
    location = None
    if latest is not None:
        location = {
            "latitude": latest.latitude,
            "longitude": latest.longitude,
            "timestamp": latest.timestamp.isoformat(),
        }
    reasons = list(journey.risk_events.filter(is_active=True).values("signal_type", "severity", "message"))
    return location or {}, {
        "score": journey.current_risk_score,
        "state": journey.current_risk_state,
        "reasons": reasons,
    }


def _create_alert(incident, alert_type, reason):
    alert, _created = SafetyAlert.objects.get_or_create(
        incident=incident,
        defaults={
            "journey": incident.journey,
            "alert_type": alert_type,
            "severity": incident.severity,
            "reason": reason,
            "delivery_status": SafetyAlert.DeliveryStatus.NOT_CONFIGURED,
        },
    )
    return alert


def escalate_checkin(check_in, now=None):
    """Turn one expired pending check-in into one incident and one guardian alert."""
    now = now or timezone.now()
    with transaction.atomic():
        changed = SafetyCheckIn.objects.filter(
            pk=check_in.pk,
            status=SafetyCheckIn.Status.PENDING,
            deadline__lte=now,
        ).update(
            status=SafetyCheckIn.Status.MISSED,
            missed_at=now,
            updated_at=now,
        )
        if not changed:
            return None

        check_in.refresh_from_db()
        journey = Journey.objects.select_related("user").get(pk=check_in.journey_id)
        location, risk = _journey_snapshot(journey)
        incident, _created = SafetyIncident.objects.get_or_create(
            check_in=check_in,
            defaults={
                "journey": journey,
                "incident_type": "MISSED_SAFETY_CHECK_IN",
                "severity": "HIGH",
                "reason": "The rider did not respond before the safety check-in deadline.",
                "last_known_location": location,
                "risk_snapshot": risk,
            },
        )
        check_in.status = SafetyCheckIn.Status.ESCALATED
        check_in.escalation_status = "ESCALATED"
        check_in.updated_at = now
        check_in.save(update_fields=["status", "escalation_status", "updated_at"])
        if journey.status not in (Journey.Status.COMPLETED, Journey.Status.CANCELLED):
            journey.status = Journey.Status.ESCALATED
            journey.save(update_fields=["status"])
        return _create_alert(
            incident,
            "MISSED_SAFETY_CHECK_IN",
            incident.reason,
        )


def process_due_checkins(now=None, batch_size=100):
    """Expire due check-ins in a management worker; safe to run repeatedly."""
    now = now or timezone.now()
    check_in_ids = list(
        SafetyCheckIn.objects.filter(status=SafetyCheckIn.Status.PENDING, deadline__lte=now)
        .order_by("deadline")
        .values_list("id", flat=True)[:batch_size]
    )
    alerts = []
    for check_in_id in check_in_ids:
        check_in = SafetyCheckIn.objects.filter(pk=check_in_id).first()
        if check_in is None:
            continue
        alert = escalate_checkin(check_in, now)
        if alert is not None:
            alerts.append(alert)
    return alerts


def create_incident_for_sos(sos):
    """Create an incident and one not-configured external alert for an explicit SOS."""
    journey = Journey.objects.select_related("user").get(pk=sos.journey_id)
    location, risk = _journey_snapshot(journey)
    if sos.latitude is not None and sos.longitude is not None:
        location = {"latitude": sos.latitude, "longitude": sos.longitude, "timestamp": sos.created_at.isoformat()}
    incident, _created = SafetyIncident.objects.get_or_create(
        sos=sos,
        defaults={
            "journey": journey,
            "incident_type": "MANUAL_SOS",
            "severity": "HIGH",
            "reason": "The rider manually requested emergency help.",
            "last_known_location": location,
            "risk_snapshot": risk,
        },
    )
    if journey.status not in (Journey.Status.COMPLETED, Journey.Status.CANCELLED):
        journey.status = Journey.Status.ESCALATED
        journey.save(update_fields=["status"])
    return incident, _create_alert(incident, "MANUAL_SOS", incident.reason)


def create_incident_for_checkin_response(check_in, response):
    """A rider selecting help or cannot-respond asks for immediate follow-up."""
    journey = Journey.objects.select_related("user").get(pk=check_in.journey_id)
    location, risk = _journey_snapshot(journey)
    reason = "The rider requested help in response to a safety check-in." if response == "HELP" else "The rider reported being unable to respond to a safety check-in."
    incident, _created = SafetyIncident.objects.get_or_create(
        check_in=check_in,
        defaults={
            "journey": journey,
            "incident_type": "RIDER_REQUESTED_HELP" if response == "HELP" else "RIDER_CANNOT_RESPOND",
            "severity": "HIGH",
            "reason": reason,
            "last_known_location": location,
            "risk_snapshot": risk,
        },
    )
    check_in.status = SafetyCheckIn.Status.ESCALATED
    check_in.escalation_status = "ESCALATED"
    check_in.response = response
    check_in.save(update_fields=["status", "response", "escalation_status", "updated_at"])
    if journey.status not in (Journey.Status.COMPLETED, Journey.Status.CANCELLED):
        journey.status = Journey.Status.ESCALATED
        journey.save(update_fields=["status"])
    return incident, _create_alert(incident, incident.incident_type, incident.reason)


def alert_payload(alert):
    incident = alert.incident
    return {
        "id": alert.id,
        "journey_id": alert.journey_id,
        "alert_type": alert.alert_type,
        "severity": alert.severity,
        "message": alert.reason,
        "created_at": alert.created_at.isoformat(),
        "last_known_location": incident.last_known_location if incident else {},
        "risk": incident.risk_snapshot if incident else {},
        "delivery_status": alert.delivery_status,
    }
