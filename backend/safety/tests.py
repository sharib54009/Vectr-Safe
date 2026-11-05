from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import TestCase
from django.utils import timezone

from journeys.models import Journey, LocationSample
from risk.models import RiskEvent
from .models import SafetyAlert, SafetyCheckIn, SafetyIncident, SOS
from .services import process_due_checkins


class CheckInEscalationTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username="rider", password="secret")
        self.journey = Journey.objects.create(user=self.user, origin="A", destination="B")
        LocationSample.objects.create(journey=self.journey, latitude=17.385, longitude=78.4867, timestamp=timezone.now())
        RiskEvent.objects.create(
            journey=self.journey, signal_type="ROUTE_DEVIATION", severity="MEDIUM",
            score_contribution=35, message="The rider is outside the planned route corridor.",
        )
        self.journey.current_risk_score = 45
        self.journey.current_risk_state = Journey.RiskState.ELEVATED
        self.journey.save(update_fields=["current_risk_score", "current_risk_state"])

    def test_due_pending_checkin_becomes_escalated_once_with_location_and_risk_snapshot(self):
        now = timezone.now()
        check_in = SafetyCheckIn.objects.create(journey=self.journey, deadline=now - timedelta(seconds=1))
        alerts = process_due_checkins(now=now)
        check_in.refresh_from_db()
        self.journey.refresh_from_db()
        self.assertEqual(len(alerts), 1)
        self.assertEqual(check_in.status, SafetyCheckIn.Status.ESCALATED)
        self.assertIsNotNone(check_in.missed_at)
        self.assertEqual(check_in.escalation_status, "ESCALATED")
        self.assertEqual(self.journey.status, Journey.Status.ESCALATED)

        incident = SafetyIncident.objects.get(check_in=check_in)
        self.assertEqual(incident.last_known_location["latitude"], 17.385)
        self.assertEqual(incident.risk_snapshot["state"], "ELEVATED")
        self.assertEqual(incident.risk_snapshot["reasons"][0]["signal_type"], "ROUTE_DEVIATION")
        alert = SafetyAlert.objects.get(incident=incident)
        self.assertEqual(alert.delivery_status, SafetyAlert.DeliveryStatus.NOT_CONFIGURED)
        self.assertEqual(process_due_checkins(now=now), [])
        self.assertEqual(SafetyIncident.objects.filter(check_in=check_in).count(), 1)
        self.assertEqual(SafetyAlert.objects.filter(incident=incident).count(), 1)

    def test_future_pending_checkin_is_not_escalated(self):
        check_in = SafetyCheckIn.objects.create(journey=self.journey, deadline=timezone.now() + timedelta(minutes=1))
        self.assertEqual(process_due_checkins(), [])
        check_in.refresh_from_db()
        self.assertEqual(check_in.status, SafetyCheckIn.Status.PENDING)
        self.assertFalse(SafetyAlert.objects.exists())

    def test_duplicate_pending_checkin_is_blocked_by_database(self):
        SafetyCheckIn.objects.create(journey=self.journey)
        with transaction.atomic(), self.assertRaises(IntegrityError):
            SafetyCheckIn.objects.create(journey=self.journey)
        self.assertEqual(SafetyCheckIn.objects.filter(journey=self.journey, status=SafetyCheckIn.Status.PENDING).count(), 1)

    def test_sos_incident_is_independent_of_risk_score(self):
        self.journey.current_risk_score = 0
        self.journey.current_risk_state = Journey.RiskState.SAFE
        self.journey.save(update_fields=["current_risk_score", "current_risk_state"])
        sos = SOS.objects.create(journey=self.journey, idempotency_key="manual-sos-1")
        from .services import create_incident_for_sos
        incident, alert = create_incident_for_sos(sos)
        self.assertEqual(incident.incident_type, "MANUAL_SOS")
        self.assertEqual(incident.severity, "HIGH")
        self.assertEqual(incident.risk_snapshot["state"], "SAFE")
        self.assertEqual(alert.delivery_status, SafetyAlert.DeliveryStatus.NOT_CONFIGURED)
