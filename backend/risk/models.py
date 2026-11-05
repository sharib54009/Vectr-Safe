from django.db import models

from journeys.models import Journey


class RiskEvent(models.Model):
    class Severity(models.TextChoices):
        LOW = "LOW", "Low"
        MEDIUM = "MEDIUM", "Medium"
        HIGH = "HIGH", "High"

    journey = models.ForeignKey(Journey, on_delete=models.CASCADE, related_name="risk_events")
    signal_type = models.CharField(max_length=40)
    severity = models.CharField(max_length=10, choices=Severity.choices, default=Severity.LOW)
    score_contribution = models.PositiveSmallIntegerField(default=0)
    message = models.CharField(max_length=255)
    details = models.JSONField(default=dict, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_observed_at = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["journey", "signal_type"], condition=models.Q(is_active=True), name="one_active_risk_signal_per_journey")]
