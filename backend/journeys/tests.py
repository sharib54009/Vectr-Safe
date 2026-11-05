from datetime import timedelta

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer
from channels.testing import WebsocketCommunicator
from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import TrustedContact
from config.asgi import application
from risk.models import RiskEvent
from safety.models import SafetyAlert, SafetyCheckIn, SafetyIncident, SOS
from safety.services import process_due_checkins
from .models import Journey, LocationSample


class JourneyApiTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.owner = user_model.objects.create_user(username="owner", email="owner@example.com", password="secret")
        self.other = user_model.objects.create_user(username="other", email="other@example.com", password="secret")
        self.guardian = user_model.objects.create_user(username="guardian", email="guardian@example.com", password="secret")
        self.client = APIClient()
        self.client.force_authenticate(self.owner)
        self.journey = Journey.objects.create(
            user=self.owner,
            origin="Library",
            destination="Home",
            planned_route=[{"latitude": 16.5, "longitude": 80.64}, {"latitude": 16.51, "longitude": 80.65}],
        )

    def test_health_is_public(self):
        self.client.force_authenticate(user=None)
        response = self.client.get(reverse("health"))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["service"], "VectrSafe Django API")

    def test_create_and_retrieve_journey(self):
        response = self.client.post(reverse("journey-list-create"), {
            "origin": "A", "destination": "B", "planned_route": [{"latitude": 1, "longitude": 2}],
        }, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["current_risk_state"], "SAFE")
        detail = self.client.get(reverse("journey-detail", args=[response.json()["id"]]))
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.json()["destination"], "B")

    def test_another_user_cannot_read_or_update_journey(self):
        self.client.force_authenticate(self.other)
        endpoints = [
            ("journey-detail", "get", None),
            ("journey-locations", "post", {"latitude": 16.5, "longitude": 80.64, "timestamp": timezone.now().isoformat()}),
            ("journey-check-ins", "get", None),
            ("journey-check-in-response", "post", {"response": "SAFE"}),
            ("journey-sos", "post", {}),
            ("journey-complete", "post", {}),
        ]
        for route, method, payload in endpoints:
            with self.subTest(route=route):
                url = reverse(route, args=[self.journey.id])
                response = getattr(self.client, method)(url, payload, format="json") if method == "post" else self.client.get(url)
                self.assertEqual(response.status_code, 404)

    def test_location_response_contains_updated_risk_eta_and_database_sample(self):
        response = self.client.post(reverse("journey-locations", args=[self.journey.id]), {
            "latitude": 16.5, "longitude": 80.64, "timestamp": timezone.now().isoformat(), "accuracy_meters": 8,
        }, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["journey_id"], self.journey.id)
        self.assertEqual(response.json()["risk"]["state"], "SAFE")
        self.assertIn("eta", response.json())
        self.assertEqual(LocationSample.objects.filter(journey=self.journey).count(), 1)

    def test_persistent_route_deviation_is_explainable_and_not_duplicated(self):
        for index in range(5):
            response = self.client.post(reverse("journey-locations", args=[self.journey.id]), {
                "latitude": 16.7, "longitude": 80.9 + index * 0.0001,
                "timestamp": (timezone.now() + timedelta(seconds=index * 10)).isoformat(),
            }, format="json")
        self.assertEqual(response.status_code, 201)
        self.assertEqual(response.json()["risk"]["state"], "ELEVATED")
        self.assertIn("meters outside", response.json()["risk"]["reasons"][0]["message"])
        self.journey.refresh_from_db()
        self.assertEqual(self.journey.highest_risk_state, Journey.RiskState.ELEVATED)
        self.assertEqual(RiskEvent.objects.filter(journey=self.journey, signal_type="ROUTE_DEVIATION", is_active=True).count(), 1)

    def test_high_risk_creates_one_pending_checkin_and_returns_reason(self):
        base_time = timezone.now() - timedelta(minutes=8)
        normal_points = [(16.5, 80.64), (16.502, 80.642), (16.504, 80.644)]
        for index, (latitude, longitude) in enumerate(normal_points):
            self.client.post(reverse("journey-locations", args=[self.journey.id]), {
                "latitude": latitude, "longitude": longitude,
                "timestamp": (base_time + timedelta(seconds=index * 30)).isoformat(),
            }, format="json")

        for index in range(3):
            response = self.client.post(reverse("journey-locations", args=[self.journey.id]), {
                "latitude": 16.512, "longitude": 80.65 + index * 0.0001,
                "timestamp": (base_time + timedelta(minutes=2, seconds=index * 20)).isoformat(),
            }, format="json")
        self.assertEqual(response.json()["risk"]["state"], "ELEVATED")

        for seconds, latitude, longitude in [(0, 16.512, 80.653), (90, 16.51205, 80.653), (180, 16.512, 80.65304)]:
            response = self.client.post(reverse("journey-locations", args=[self.journey.id]), {
                "latitude": latitude, "longitude": longitude,
                "timestamp": (base_time + timedelta(minutes=5, seconds=seconds)).isoformat(),
            }, format="json")
        self.assertEqual(response.json()["risk"]["state"], "HIGH")
        self.assertEqual(response.json()["check_in"]["status"], SafetyCheckIn.Status.PENDING)
        self.assertEqual(SafetyCheckIn.objects.filter(journey=self.journey, status=SafetyCheckIn.Status.PENDING).count(), 1)

        response = self.client.post(reverse("journey-locations", args=[self.journey.id]), {
            "latitude": 16.512, "longitude": 80.653,
            "timestamp": (base_time + timedelta(minutes=9)).isoformat(),
        }, format="json")
        self.assertEqual(response.json()["risk"]["state"], "HIGH")
        self.assertEqual(SafetyCheckIn.objects.filter(journey=self.journey).count(), 1)

    def test_full_high_risk_missed_checkin_reaches_only_authorized_guardian(self):
        contact = TrustedContact.objects.create(user=self.owner, name="Guardian", email=self.guardian.email)
        guardian_client = APIClient()
        guardian_client.force_authenticate(self.guardian)
        accepted = guardian_client.post(reverse("guardian-invitation-accept"), {"invitation_code": contact.invitation_code}, format="json")
        self.assertEqual(accepted.status_code, 200)

        base_time = timezone.now() - timedelta(minutes=8)
        for index in range(3):
            self.client.post(reverse("journey-locations", args=[self.journey.id]), {
                "latitude": 16.7, "longitude": 80.9 + index * 0.0001,
                "timestamp": (base_time + timedelta(seconds=index * 20)).isoformat(),
            }, format="json")
        for seconds, longitude in [(0, 80.903), (90, 80.90305), (180, 80.903)]:
            response = self.client.post(reverse("journey-locations", args=[self.journey.id]), {
                "latitude": 16.7, "longitude": longitude,
                "timestamp": (base_time + timedelta(minutes=3, seconds=seconds)).isoformat(),
            }, format="json")
        self.assertEqual(response.json()["risk"]["state"], "HIGH")
        check_in = SafetyCheckIn.objects.get(journey=self.journey, status=SafetyCheckIn.Status.PENDING)
        now = timezone.now()
        check_in.deadline = now - timedelta(seconds=1)
        check_in.save(update_fields=["deadline"])
        process_due_checkins(now=now)

        alert_response = guardian_client.get(reverse("safety-alert-list"))
        self.assertEqual(alert_response.status_code, 200)
        alert = alert_response.json()[0]
        self.assertEqual(alert["alert_type"], "MISSED_SAFETY_CHECK_IN")
        self.assertEqual(alert["delivery_status"], SafetyAlert.DeliveryStatus.NOT_CONFIGURED)
        self.assertEqual(alert["last_known_location"]["latitude"], 16.7)
        self.assertTrue(alert["risk"]["reasons"])

        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(reverse("safety-alert-detail", args=[alert["id"]])).status_code, 404)

    def test_safe_response_is_recorded_without_escalation(self):
        check_in = SafetyCheckIn.objects.create(
            journey=self.journey,
            deadline=timezone.now() + timedelta(seconds=30),
            reason="Please confirm you are safe.",
        )
        response = self.client.post(reverse("journey-check-in-response", args=[self.journey.id]), {"response": "SAFE"}, format="json")
        check_in.refresh_from_db()
        self.assertEqual(response.status_code, 200)
        self.assertEqual(check_in.status, SafetyCheckIn.Status.RESPONDED_SAFE)
        self.assertIsNotNone(check_in.responded_at)
        self.assertFalse(SafetyIncident.objects.filter(check_in=check_in).exists())
        self.assertFalse(SafetyAlert.objects.filter(journey=self.journey).exists())

    def test_expired_checkin_cannot_be_marked_safe(self):
        check_in = SafetyCheckIn.objects.create(journey=self.journey, deadline=timezone.now() - timedelta(seconds=1))
        response = self.client.post(reverse("journey-check-in-response", args=[self.journey.id]), {"response": "SAFE"}, format="json")
        check_in.refresh_from_db()
        self.assertEqual(response.status_code, 409)
        self.assertEqual(check_in.status, SafetyCheckIn.Status.ESCALATED)
        self.assertEqual(SafetyIncident.objects.filter(check_in=check_in).count(), 1)

    def test_help_response_creates_incident_and_alert(self):
        check_in = SafetyCheckIn.objects.create(journey=self.journey, deadline=timezone.now() + timedelta(minutes=1))
        response = self.client.post(reverse("journey-check-in-response", args=[self.journey.id]), {"response": "HELP"}, format="json")
        self.assertEqual(response.status_code, 200)
        check_in.refresh_from_db()
        self.assertEqual(check_in.status, SafetyCheckIn.Status.ESCALATED)
        self.assertEqual(SafetyIncident.objects.filter(check_in=check_in).count(), 1)
        self.assertEqual(SafetyAlert.objects.filter(incident__check_in=check_in).count(), 1)

    def test_sos_creates_high_severity_incident_and_is_idempotent(self):
        LocationSample.objects.create(journey=self.journey, latitude=16.5, longitude=80.64, timestamp=timezone.now())
        url = reverse("journey-sos", args=[self.journey.id])
        headers = {"HTTP_IDEMPOTENCY_KEY": "sos-request-1"}
        first = self.client.post(url, {}, format="json", **headers)
        repeated = self.client.post(url, {}, format="json", **headers)
        self.assertEqual(first.status_code, 201)
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(SOS.objects.filter(journey=self.journey).count(), 1)
        incident = SafetyIncident.objects.get(journey=self.journey)
        alert = SafetyAlert.objects.get(incident=incident)
        self.assertEqual(incident.incident_type, "MANUAL_SOS")
        self.assertEqual(incident.severity, "HIGH")
        self.assertEqual(incident.last_known_location["latitude"], 16.5)
        self.assertEqual(alert.delivery_status, SafetyAlert.DeliveryStatus.NOT_CONFIGURED)

    def test_guardian_invitation_limits_journey_and_alert_access(self):
        contact = TrustedContact.objects.create(user=self.owner, name="Guardian", email=self.guardian.email)
        self.client.force_authenticate(self.guardian)
        accepted = self.client.post(reverse("guardian-invitation-accept"), {"invitation_code": contact.invitation_code}, format="json")
        self.assertEqual(accepted.status_code, 200)
        self.assertEqual(self.client.get(reverse("guardian-journeys")).json()[0]["id"], self.journey.id)

        incident = SafetyIncident.objects.create(journey=self.journey, sos=SOS.objects.create(journey=self.journey), incident_type="MANUAL_SOS", reason="Help requested")
        alert = SafetyAlert.objects.create(journey=self.journey, incident=incident, alert_type="MANUAL_SOS", reason=incident.reason)
        self.assertEqual(self.client.get(reverse("safety-alert-list")).json()[0]["id"], alert.id)
        detail = self.client.get(reverse("guardian-journey-detail", args=[self.journey.id]))
        self.assertEqual(detail.status_code, 200)
        self.assertIsNotNone(detail.json()["started_at"])
        self.assertEqual(len(detail.json()["incidents"]), 1)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(reverse("guardian-journeys")).json(), [])
        self.assertEqual(self.client.get(reverse("guardian-journey-detail", args=[self.journey.id])).status_code, 404)
        self.assertEqual(self.client.get(reverse("safety-alert-detail", args=[alert.id])).status_code, 404)

    def test_websocket_owner_and_accepted_guardian_only_receive_journey_events(self):
        contact = TrustedContact.objects.create(user=self.owner, name="Guardian", email=self.guardian.email)
        contact.guardian_user = self.guardian
        contact.accepted_at = timezone.now()
        contact.save(update_fields=["guardian_user", "accepted_at"])

        def connect_for(user):
            browser = Client()
            browser.force_login(user)
            cookie = browser.cookies["sessionid"].value

            async def connect():
                communicator = WebsocketCommunicator(
                    application,
                    f"/ws/journeys/{self.journey.id}/",
                    headers=[(b"cookie", f"sessionid={cookie}".encode()), (b"origin", b"http://testserver")],
                )
                result = await communicator.connect()
                if result[0]:
                    layer = get_channel_layer()
                    await layer.group_send(f"journey_{self.journey.id}", {"type": "risk_update", "payload": {"event": "risk_update", "journey_id": self.journey.id}})
                    event = await communicator.receive_json_from(timeout=1)
                    await communicator.disconnect()
                    return result, event
                return result, None

            return async_to_sync(connect)()

        self.assertEqual(connect_for(self.owner)[1]["event"], "risk_update")
        self.assertEqual(connect_for(self.guardian)[1]["event"], "risk_update")
        self.assertFalse(connect_for(self.other)[0][0])

    def test_sos_requires_idempotency_key(self):
        response = self.client.post(reverse("journey-sos", args=[self.journey.id]), {}, format="json")
        self.assertEqual(response.status_code, 400)

    def test_owner_can_complete_journey_once_and_completed_journey_rejects_gps(self):
        pending = SafetyCheckIn.objects.create(journey=self.journey, deadline=timezone.now() + timedelta(minutes=1))
        url = reverse("journey-complete", args=[self.journey.id])
        first = self.client.post(url, {}, format="json")
        self.assertEqual(first.status_code, 200)
        self.assertEqual(first.json()["status"], Journey.Status.COMPLETED)
        self.assertIsNotNone(first.json()["ended_at"])
        pending.refresh_from_db()
        self.assertEqual(pending.status, SafetyCheckIn.Status.CANCELLED)
        ended_at = first.json()["ended_at"]

        repeated = self.client.post(url, {}, format="json")
        self.assertEqual(repeated.status_code, 200)
        self.assertEqual(repeated.json()["ended_at"], ended_at)

        gps = self.client.post(reverse("journey-locations", args=[self.journey.id]), {
            "latitude": 16.5, "longitude": 80.64, "timestamp": timezone.now().isoformat(),
        }, format="json")
        self.assertEqual(gps.status_code, 409)
        self.assertEqual(LocationSample.objects.filter(journey=self.journey).count(), 0)

    def test_unauthenticated_journey_creation_is_rejected(self):
        self.client.force_authenticate(user=None)
        response = self.client.post(reverse("journey-list-create"), {"origin": "A", "destination": "B"}, format="json")
        self.assertEqual(response.status_code, 403)
