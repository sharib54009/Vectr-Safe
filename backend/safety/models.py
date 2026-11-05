from datetime import timedelta

from django.conf import settings
from django.db import models
from django.utils import timezone

from journeys.models import Journey


def default_checkin_deadline():
    timeout = getattr(settings, "SAFETY_CHECKIN_TIMEOUT_SECONDS", 60)
    return timezone.now() + timedelta(seconds=timeout)


class SafetyCheckIn(models.Model):
    class Status(models.TextChoices):
        PENDING = "PENDING", "Pending"
        RESPONDED_SAFE = "RESPONDED_SAFE", "Responded safe"
        RESPONDED_HELP = "RESPONDED_HELP", "Responded and requested help"
        RESPONDED_CANNOT_RESPOND = "RESPONDED_CANNOT_RESPOND", "Could not respond"
        MISSED = "MISSED", "Missed"
        ESCALATED = "ESCALATED", "Escalated"
        CANCELLED = "CANCELLED", "Cancelled"

    journey = models.ForeignKey(Journey, on_delete=models.CASCADE, related_name="check_ins")
    created_at = models.DateTimeField(auto_now_add=True)
    deadline = models.DateTimeField(default=default_checkin_deadline)
    responded_at = models.DateTimeField(null=True, blank=True)
    missed_at = models.DateTimeField(null=True, blank=True)
    status = models.CharField(max_length=30, choices=Status.choices, default=Status.PENDING)
    response = models.CharField(max_length=20, blank=True)
    reason = models.CharField(max_length=255, default="Several persistent movement signals raised the risk state.")
    escalation_status = models.CharField(max_length=20, default="NOT_STARTED")
    updated_at = models.DateTimeField(default=timezone.now)

    class Meta:
        constraints = [models.UniqueConstraint(
            fields=["journey"],
            condition=models.Q(status="PENDING"),
            name="one_pending_checkin_per_journey",
        )]


class SafetyAlert(models.Model):
    class DeliveryStatus(models.TextChoices):
        PENDING = "PENDING", "Pending"
        SENT = "SENT", "Sent"
        DELIVERED = "DELIVERED", "Delivered"
        FAILED = "FAILED", "Failed"
        NOT_CONFIGURED = "NOT_CONFIGURED", "External delivery not configured"

    journey = models.ForeignKey(Journey, on_delete=models.CASCADE, related_name="alerts")
    incident = models.OneToOneField("safety.SafetyIncident", on_delete=models.CASCADE, null=True, blank=True, related_name="alert")
    alert_type = models.CharField(max_length=40)
    severity = models.CharField(max_length=10, default="HIGH")
    reason = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    delivery_status = models.CharField(max_length=20, choices=DeliveryStatus.choices, default=DeliveryStatus.NOT_CONFIGURED)
    delivered_at = models.DateTimeField(null=True, blank=True)


class SOS(models.Model):
    journey = models.ForeignKey(Journey, on_delete=models.CASCADE, related_name="sos_events")
    created_at = models.DateTimeField(auto_now_add=True)
    latitude = models.FloatField(null=True, blank=True)
    longitude = models.FloatField(null=True, blank=True)
    message = models.CharField(max_length=255, default="Rider requested emergency help.")
    delivery_status = models.CharField(
        max_length=20,
        choices=SafetyAlert.DeliveryStatus.choices,
        default=SafetyAlert.DeliveryStatus.NOT_CONFIGURED,
    )
    idempotency_key = models.CharField(max_length=64, blank=True, default="")

    class Meta:
        constraints = [models.UniqueConstraint(
            fields=["journey", "idempotency_key"],
            condition=~models.Q(idempotency_key=""),
            name="unique_sos_idempotency_per_journey",
        )]


class SafetyIncident(models.Model):
    class Status(models.TextChoices):
        OPEN = "OPEN", "Open"
        RESOLVED = "RESOLVED", "Resolved"

    journey = models.ForeignKey(Journey, on_delete=models.CASCADE, related_name="incidents")
    check_in = models.OneToOneField(SafetyCheckIn, on_delete=models.CASCADE, null=True, blank=True, related_name="incident")
    sos = models.OneToOneField(SOS, on_delete=models.CASCADE, null=True, blank=True, related_name="incident")
    incident_type = models.CharField(max_length=40)
    severity = models.CharField(max_length=10, default="HIGH")
    reason = models.CharField(max_length=255)
    last_known_location = models.JSONField(default=dict, blank=True)
    risk_snapshot = models.JSONField(default=dict, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.OPEN)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        constraints = [models.CheckConstraint(
            condition=(models.Q(check_in__isnull=False) | models.Q(sos__isnull=False)),
            name="incident_has_checkin_or_sos_source",
        )]
