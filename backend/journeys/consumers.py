import asyncio
import logging

from channels.db import database_sync_to_async
from channels.generic.websocket import AsyncJsonWebsocketConsumer
from django.conf import settings
from django.db.models import Max, Q

from safety.models import SafetyAlert, SafetyCheckIn
from safety.serializers import SafetyCheckInSerializer
from safety.services import alert_payload
from .models import Journey

logger = logging.getLogger(__name__)


class JourneyConsumer(AsyncJsonWebsocketConsumer):
    async def connect(self):
        user = self.scope.get("user")
        allowed = user is not None and user.is_authenticated and await self.user_can_access_journey(
            user.pk, self.scope["url_route"]["kwargs"]["journey_id"]
        )
        if not allowed:
            await self.close(code=4403)
            return
        self.group_name = f"journey_{self.scope['url_route']['kwargs']['journey_id']}"
        await self.channel_layer.group_add(self.group_name, self.channel_name)
        self.last_alert_id, self.checkin_statuses, self.current_journey_status, pending = await self.load_initial_safety_state(
            self.scope["url_route"]["kwargs"]["journey_id"]
        )
        await self.accept()
        if pending is not None:
            await self.send_json({"event": "check_in_requested", "journey_id": self.scope["url_route"]["kwargs"]["journey_id"], "check_in": pending})
        self.poll_task = asyncio.create_task(self.poll_safety_events())

    async def disconnect(self, close_code):
        if hasattr(self, "poll_task"):
            self.poll_task.cancel()
        if hasattr(self, "group_name"):
            await self.channel_layer.group_discard(self.group_name, self.channel_name)

    async def location_update(self, event):
        await self.send_json(event["payload"])

    async def risk_update(self, event):
        await self.send_json(event["payload"])

    async def journey_status(self, event):
        await self.send_json(event["payload"])

    async def poll_safety_events(self):
        journey_id = self.scope["url_route"]["kwargs"]["journey_id"]
        interval = max(0.5, settings.SAFETY_EVENT_POLL_SECONDS)
        while True:
            await asyncio.sleep(interval)
            try:
                user = self.scope.get("user")
                if user is None or not await self.user_can_access_journey(user.pk, journey_id):
                    await self.close(code=4403)
                    return
                alerts, checkins, journey_status = await self.load_new_safety_events(journey_id, self.last_alert_id)
                for alert in alerts:
                    self.last_alert_id = max(self.last_alert_id, alert["id"])
                    await self.send_json({"event": "safety_alert", **alert})
                if journey_status is not None and journey_status != self.current_journey_status:
                    self.current_journey_status = journey_status
                    await self.send_json({"event": "journey_status", "journey_id": journey_id, "status": journey_status})
                for checkin in checkins:
                    previous_status = self.checkin_statuses.get(checkin["id"])
                    self.checkin_statuses[checkin["id"]] = checkin["status"]
                    if previous_status is None and checkin["status"] == SafetyCheckIn.Status.PENDING:
                        event_name = "check_in_requested"
                    elif previous_status is not None and previous_status != checkin["status"]:
                        event_name = "check_in_updated"
                    else:
                        continue
                    await self.send_json({"event": event_name, "journey_id": journey_id, "check_in": checkin})
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Could not poll persisted safety events for journey %s", journey_id)

    @database_sync_to_async
    def user_can_access_journey(self, user_id, journey_id):
        return Journey.objects.filter(pk=journey_id).filter(
            Q(user_id=user_id)
            | Q(
                user__trusted_contacts__guardian_user_id=user_id,
                user__trusted_contacts__is_active=True,
                user__trusted_contacts__accepted_at__isnull=False,
            )
        ).exists()

    @database_sync_to_async
    def load_initial_safety_state(self, journey_id):
        last_alert_id = SafetyAlert.objects.filter(journey_id=journey_id).aggregate(max_id=Max("id"))["max_id"] or 0
        journey_status = Journey.objects.filter(pk=journey_id).values_list("status", flat=True).first()
        checkins = list(SafetyCheckIn.objects.filter(journey_id=journey_id).order_by("-created_at")[:100])
        statuses = {checkin.id: checkin.status for checkin in checkins}
        pending = next((checkin for checkin in checkins if checkin.status == SafetyCheckIn.Status.PENDING), None)
        pending_data = None if pending is None else SafetyCheckInSerializer(pending).data
        return last_alert_id, statuses, journey_status, pending_data

    @database_sync_to_async
    def load_new_safety_events(self, journey_id, after_alert_id):
        alerts = list(SafetyAlert.objects.filter(journey_id=journey_id, id__gt=after_alert_id).select_related("incident").order_by("id"))
        alert_data = [alert_payload(alert) for alert in alerts]
        checkins = list(SafetyCheckIn.objects.filter(journey_id=journey_id).order_by("-created_at")[:100])
        journey_status = Journey.objects.filter(pk=journey_id).values_list("status", flat=True).first()
        return alert_data, SafetyCheckInSerializer(checkins, many=True).data, journey_status
