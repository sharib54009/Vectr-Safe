from datetime import timedelta

from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import TrustedContact
from risk import config as risk_config
from risk.engine import estimate_eta, evaluate_movement, transition_risk_state
from risk.models import RiskEvent
from safety.models import SafetyAlert, SafetyCheckIn, SOS
from safety.serializers import SafetyAlertSerializer, SafetyCheckInSerializer, SafetyIncidentSerializer, SOSSerializer
from safety.services import create_incident_for_checkin_response, create_incident_for_sos, escalate_checkin
from .events import publish_journey_event
from .models import Journey
from .serializers import JourneySerializer, LocationSampleSerializer


def get_recent_locations(journey):
    """Read a bounded, chronological GPS history from the database for each analysis."""
    newest_first = list(journey.locations.order_by("-timestamp", "-id")[:risk_config.RECENT_LOCATION_LIMIT])
    return [
        {
            "latitude": sample.latitude,
            "longitude": sample.longitude,
            "timestamp": sample.timestamp,
            "heading_degrees": sample.heading_degrees,
            "speed_meters_per_second": sample.speed_meters_per_second,
        }
        for sample in reversed(newest_first)
    ]


def get_display_locations(journey, limit=500):
    """Keep detailed map responses bounded when a journey has a long GPS trace."""
    newest_first = list(journey.locations.order_by("-timestamp", "-id")[:limit])
    return list(reversed(newest_first))


def update_risk_events(journey, reasons, now):
    """Keep one active row per signal type; mark cleared signals inactive."""
    active_types = set()
    for reason in reasons:
        signal_type = reason["type"]
        active_types.add(signal_type)
        event, created = RiskEvent.objects.get_or_create(
            journey=journey,
            signal_type=signal_type,
            is_active=True,
            defaults={
                "severity": reason["severity"],
                "score_contribution": reason["score_contribution"],
                "message": reason["message"],
                "details": reason,
                "last_observed_at": now,
            },
        )
        if not created:
            event.severity = reason["severity"]
            event.score_contribution = reason["score_contribution"]
            event.message = reason["message"]
            event.details = reason
            event.last_observed_at = now
            event.save(update_fields=["severity", "score_contribution", "message", "details", "last_observed_at"])
    journey.risk_events.filter(is_active=True).exclude(signal_type__in=active_types).update(is_active=False)


def owner_journey_or_404(request, journey_id):
    return get_object_or_404(Journey.objects.filter(user=request.user), pk=journey_id)


def guardian_journeys(user):
    return Journey.objects.filter(
        user__trusted_contacts__guardian_user=user,
        user__trusted_contacts__is_active=True,
        user__trusted_contacts__accepted_at__isnull=False,
    ).select_related("user").distinct()


def guardian_journey_or_404(user, journey_id):
    return get_object_or_404(guardian_journeys(user), pk=journey_id)


def journey_summary(journey):
    latest = journey.locations.order_by("-timestamp", "-id").first()
    latest_alert = journey.alerts.select_related("incident").order_by("-created_at").first()
    risk_reasons = list(journey.risk_events.filter(is_active=True).values("signal_type", "severity", "message"))
    return {
        "id": journey.id,
        "rider_name": journey.user.get_full_name() or journey.user.username,
        "origin": journey.origin,
        "destination": journey.destination,
        "planned_route": journey.planned_route,
        "origin_location": journey.origin_location,
        "destination_location": journey.destination_location,
        "status": journey.status,
        "started_at": journey.started_at,
        "ended_at": journey.ended_at,
        "expected_arrival_at": journey.expected_arrival_at,
        "risk": {
            "score": journey.current_risk_score,
            "state": journey.current_risk_state,
            "reasons": [{"type": item["signal_type"], "severity": item["severity"], "message": item["message"]} for item in risk_reasons],
        },
        "highest_risk_state": journey.highest_risk_state,
        "estimated_arrival_at": journey.estimated_arrival_at,
        "remaining_distance_meters": journey.remaining_distance_meters,
        "risk_reasons": risk_reasons,
        "last_known_location": None if latest is None else LocationSampleSerializer(latest).data,
        "last_location_at": None if latest is None else latest.timestamp,
        "latest_alert": None if latest_alert is None else SafetyAlertSerializer(latest_alert).data,
    }


class JourneyListCreateView(APIView):
    def get(self, request):
        journeys = Journey.objects.filter(user=request.user).order_by("-started_at")
        return Response(JourneySerializer(journeys, many=True).data)

    def post(self, request):
        serializer = JourneySerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        journey = serializer.save(user=request.user)
        return Response(JourneySerializer(journey).data, status=status.HTTP_201_CREATED)


class JourneyDetailView(APIView):
    def get(self, request, journey_id):
        journey = owner_journey_or_404(request, journey_id)
        data = JourneySerializer(journey).data
        data["locations"] = LocationSampleSerializer(get_display_locations(journey), many=True).data
        data["risk_reasons"] = list(journey.risk_events.order_by("-created_at").values(
            "signal_type", "severity", "score_contribution", "message", "details", "created_at", "last_observed_at", "is_active",
        ))
        data["check_ins"] = SafetyCheckInSerializer(journey.check_ins.order_by("-created_at"), many=True).data
        data["alerts"] = SafetyAlertSerializer(journey.alerts.select_related("incident").order_by("-created_at"), many=True).data
        return Response(data)


class JourneyLocationView(APIView):
    def post(self, request, journey_id):
        journey = owner_journey_or_404(request, journey_id)
        if journey.status in (Journey.Status.COMPLETED, Journey.Status.CANCELLED):
            return Response({"detail": "This journey has ended and no longer accepts location updates."}, status=status.HTTP_409_CONFLICT)
        serializer = LocationSampleSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        now = timezone.now()
        with transaction.atomic():
            location = serializer.save(journey=journey)
            locations = get_recent_locations(journey)
            analysis = evaluate_movement(locations, journey.planned_route, now, journey.expected_arrival_at)
            eta = estimate_eta(locations, journey.planned_route, now, journey.started_at)
            old_state = journey.current_risk_state
            old_status = journey.status
            risk_state, lower_count = transition_risk_state(old_state, analysis["state"], journey.lower_risk_sample_count)
            journey.current_risk_score = analysis["score"]
            journey.current_risk_state = risk_state
            state_rank = {Journey.RiskState.SAFE: 0, Journey.RiskState.ELEVATED: 1, Journey.RiskState.HIGH: 2}
            if state_rank[risk_state] > state_rank[journey.highest_risk_state]:
                journey.highest_risk_state = risk_state
            journey.lower_risk_sample_count = lower_count
            journey.estimated_arrival_at = eta["estimated_arrival"]
            journey.remaining_distance_meters = eta["remaining_distance_meters"]
            if risk_state == Journey.RiskState.HIGH:
                journey.status = Journey.Status.HIGH_RISK
            elif journey.status in (Journey.Status.ACTIVE, Journey.Status.HIGH_RISK):
                journey.status = Journey.Status.ACTIVE
            journey.save(update_fields=[
                "current_risk_score", "current_risk_state", "lower_risk_sample_count", "estimated_arrival_at",
                "remaining_distance_meters", "status",
                "highest_risk_state",
            ])
            update_risk_events(journey, analysis["reasons"], now)

            check_in = None
            if risk_state == Journey.RiskState.HIGH:
                pending = None
                if old_state != Journey.RiskState.HIGH:
                    pending, created = SafetyCheckIn.objects.get_or_create(
                        journey=journey,
                        status=SafetyCheckIn.Status.PENDING,
                        defaults={
                            "deadline": now + timedelta(seconds=risk_config.SAFETY_CHECKIN_TIMEOUT_SECONDS),
                            "reason": " ".join(reason["message"] for reason in analysis["reasons"]),
                        },
                    )
                    if pending is not None:
                        check_in = pending
                else:
                    check_in = journey.check_ins.filter(status=SafetyCheckIn.Status.PENDING).first()

            reasons = analysis["reasons"]
            if risk_state != Journey.RiskState.SAFE and not reasons:
                reasons = [{
                    "type": "RISK_COOLDOWN", "severity": "LOW", "score_contribution": 0,
                    "message": "The risk state is being held briefly while recent locations confirm that conditions have changed.",
                }]
            risk_payload = {"score": analysis["score"], "state": risk_state, "reasons": reasons}
            eta_payload = {
                **eta,
                "estimated_arrival": eta["estimated_arrival"].isoformat() if eta["estimated_arrival"] else None,
            }
            check_in_payload = None if check_in is None else SafetyCheckInSerializer(check_in).data
            location_payload = LocationSampleSerializer(location).data
            response_data = {
                "journey_id": journey.id,
                "location": location_payload,
                "risk": risk_payload,
                "eta": eta_payload,
                "elapsed_seconds": eta["elapsed_seconds"],
                "check_in": check_in_payload,
            }
            transaction.on_commit(lambda: publish_journey_event(journey.id, "location_update", {
                "journey_id": journey.id, "location": location_payload, "eta": eta_payload,
            }))
            transaction.on_commit(lambda: publish_journey_event(journey.id, "risk_update", {
                "journey_id": journey.id, "risk": risk_payload,
            }))
            if old_status != journey.status:
                transaction.on_commit(lambda: publish_journey_event(journey.id, "journey_status", {
                    "journey_id": journey.id, "status": journey.status,
                }))
        return Response(response_data, status=status.HTTP_201_CREATED)


class JourneyCompleteView(APIView):
    def post(self, request, journey_id):
        journey = owner_journey_or_404(request, journey_id)
        if journey.status == Journey.Status.CANCELLED:
            return Response({"detail": "A cancelled journey cannot be completed."}, status=status.HTTP_409_CONFLICT)
        if journey.status != Journey.Status.COMPLETED:
            now = timezone.now()
            journey.status = Journey.Status.COMPLETED
            journey.ended_at = now
            journey.save(update_fields=["status", "ended_at"])
            SafetyCheckIn.objects.filter(
                journey=journey,
                status=SafetyCheckIn.Status.PENDING,
            ).update(status=SafetyCheckIn.Status.CANCELLED, updated_at=now)
            publish_journey_event(journey.id, "journey_status", {
                "journey_id": journey.id,
                "status": journey.status,
                "ended_at": journey.ended_at.isoformat(),
            })
        return Response(JourneySerializer(journey).data)


class JourneyCheckInListView(APIView):
    def get(self, request, journey_id):
        journey = owner_journey_or_404(request, journey_id)
        check_ins = journey.check_ins.order_by("-created_at")
        return Response(SafetyCheckInSerializer(check_ins, many=True).data)


class CheckInResponseView(APIView):
    def post(self, request, journey_id):
        journey = owner_journey_or_404(request, journey_id)
        response_value = str(request.data.get("response", "")).upper()
        response_status = {
            "SAFE": SafetyCheckIn.Status.RESPONDED_SAFE,
            "HELP": SafetyCheckIn.Status.RESPONDED_HELP,
            "CANNOT_RESPOND": SafetyCheckIn.Status.RESPONDED_CANNOT_RESPOND,
        }.get(response_value)
        if response_status is None:
            return Response({"detail": "response must be SAFE, HELP, or CANNOT_RESPOND."}, status=status.HTTP_400_BAD_REQUEST)
        now = timezone.now()
        check_in = journey.check_ins.filter(status=SafetyCheckIn.Status.PENDING).order_by("-created_at").first()
        if check_in is None:
            return Response({"detail": "There is no pending check-in to answer."}, status=status.HTTP_409_CONFLICT)
        if check_in.deadline <= now:
            escalate_checkin(check_in, now)
            return Response({"detail": "The check-in deadline passed and it has been escalated.", "status": SafetyCheckIn.Status.ESCALATED}, status=status.HTTP_409_CONFLICT)

        changed = SafetyCheckIn.objects.filter(
            pk=check_in.pk,
            status=SafetyCheckIn.Status.PENDING,
            deadline__gt=now,
        ).update(response=response_value, status=response_status, responded_at=now, updated_at=now)
        if not changed:
            check_in.refresh_from_db()
            if check_in.status == SafetyCheckIn.Status.PENDING and check_in.deadline <= timezone.now():
                escalate_checkin(check_in, timezone.now())
                return Response({"detail": "The check-in deadline passed and it has been escalated.", "status": SafetyCheckIn.Status.ESCALATED}, status=status.HTTP_409_CONFLICT)
            return Response({"detail": "The check-in is no longer pending."}, status=status.HTTP_409_CONFLICT)
        check_in.refresh_from_db()

        alert = None
        if response_value in {"HELP", "CANNOT_RESPOND"}:
            _incident, alert = create_incident_for_checkin_response(check_in, response_value)
        return Response({
            "check_in": SafetyCheckInSerializer(check_in).data,
            "alert": None if alert is None else SafetyAlertSerializer(alert).data,
        })


class SOSView(APIView):
    def post(self, request, journey_id):
        journey = owner_journey_or_404(request, journey_id)
        idempotency_key = request.headers.get("Idempotency-Key", "").strip()
        if not idempotency_key or len(idempotency_key) > 64:
            return Response({"detail": "A unique Idempotency-Key header is required for SOS."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            latitude = float(request.data["latitude"]) if request.data.get("latitude") is not None else None
            longitude = float(request.data["longitude"]) if request.data.get("longitude") is not None else None
        except (TypeError, ValueError):
            return Response({"detail": "latitude and longitude must be numbers."}, status=status.HTTP_400_BAD_REQUEST)
        if (latitude is None) != (longitude is None) or (latitude is not None and not (-90 <= latitude <= 90 and -180 <= longitude <= 180)):
            return Response({"detail": "Provide both valid latitude and longitude values."}, status=status.HTTP_400_BAD_REQUEST)

        sos, created = SOS.objects.get_or_create(
            journey=journey,
            idempotency_key=idempotency_key,
            defaults={"latitude": latitude, "longitude": longitude},
        )
        incident, alert = create_incident_for_sos(sos)
        return Response({
            "sos": SOSSerializer(sos).data,
            "incident_id": incident.id,
            "alert": SafetyAlertSerializer(alert).data,
        }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


class GuardianJourneyListView(APIView):
    def get(self, request):
        return Response([journey_summary(journey) for journey in guardian_journeys(request.user).order_by("-started_at")])


class GuardianJourneyDetailView(APIView):
    def get(self, request, journey_id):
        journey = guardian_journey_or_404(request.user, journey_id)
        data = journey_summary(journey)
        data["locations"] = LocationSampleSerializer(get_display_locations(journey), many=True).data
        data["alerts"] = SafetyAlertSerializer(journey.alerts.select_related("incident").order_by("-created_at"), many=True).data
        data["check_ins"] = SafetyCheckInSerializer(journey.check_ins.order_by("-created_at"), many=True).data
        data["incidents"] = SafetyIncidentSerializer(journey.incidents.order_by("-created_at"), many=True).data
        return Response(data)


class GuardianTrustedContactListView(APIView):
    """List accepted guardian relationships for this signed-in contact."""
    def get(self, request):
        links = TrustedContact.objects.filter(
            guardian_user=request.user, is_active=True, accepted_at__isnull=False,
        ).select_related("user")
        return Response([
            {"rider": link.user.get_full_name() or link.user.username, "contact_id": link.id}
            for link in links
        ])
