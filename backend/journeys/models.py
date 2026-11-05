from django.conf import settings
from django.db import models


class Journey(models.Model):
    class Status(models.TextChoices):
        ACTIVE = "ACTIVE", "Active"
        HIGH_RISK = "HIGH_RISK", "High risk"
        ESCALATED = "ESCALATED", "Escalated"
        COMPLETED = "COMPLETED", "Completed"
        CANCELLED = "CANCELLED", "Cancelled"

    class RiskState(models.TextChoices):
        SAFE = "SAFE", "Safe"
        ELEVATED = "ELEVATED", "Elevated"
        HIGH = "HIGH", "High"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="journeys")
    origin = models.CharField(max_length=255)
    destination = models.CharField(max_length=255)
    status = models.CharField(max_length=16, choices=Status.choices, default=Status.ACTIVE)
    started_at = models.DateTimeField(auto_now_add=True)
    expected_arrival_at = models.DateTimeField(null=True, blank=True)
    estimated_arrival_at = models.DateTimeField(null=True, blank=True)
    remaining_distance_meters = models.PositiveIntegerField(null=True, blank=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    planned_route = models.JSONField(default=list, blank=True, help_text="Ordered latitude/longitude points for this journey.")
    origin_location = models.JSONField(default=dict, blank=True)
    destination_location = models.JSONField(default=dict, blank=True)
    current_risk_state = models.CharField(max_length=12, choices=RiskState.choices, default=RiskState.SAFE)
    highest_risk_state = models.CharField(max_length=12, choices=RiskState.choices, default=RiskState.SAFE)
    current_risk_score = models.PositiveSmallIntegerField(default=0)
    lower_risk_sample_count = models.PositiveSmallIntegerField(default=0)

    def __str__(self):
        return f"{self.origin} to {self.destination} ({self.user_id})"


class LocationSample(models.Model):
    journey = models.ForeignKey(Journey, on_delete=models.CASCADE, related_name="locations")
    latitude = models.FloatField()
    longitude = models.FloatField()
    timestamp = models.DateTimeField()
    accuracy_meters = models.FloatField(null=True, blank=True)
    speed_meters_per_second = models.FloatField(null=True, blank=True)
    heading_degrees = models.FloatField(null=True, blank=True)

    class Meta:
        ordering = ["timestamp", "id"]
        indexes = [models.Index(fields=["journey", "timestamp"], name="journey_location_time_idx")]


