from rest_framework import serializers

from .models import SafetyAlert, SafetyCheckIn, SafetyIncident, SOS


class SafetyCheckInSerializer(serializers.ModelSerializer):
    class Meta:
        model = SafetyCheckIn
        fields = ["id", "created_at", "deadline", "responded_at", "missed_at", "status", "response", "reason", "escalation_status"]


class SOSSerializer(serializers.ModelSerializer):
    class Meta:
        model = SOS
        fields = ["id", "created_at", "latitude", "longitude", "message", "delivery_status", "trigger_source"]


class SafetyIncidentSerializer(serializers.ModelSerializer):
    class Meta:
        model = SafetyIncident
        fields = ["id", "journey_id", "incident_type", "severity", "reason", "last_known_location", "risk_snapshot", "status", "created_at"]


class SafetyAlertSerializer(serializers.ModelSerializer):
    incident_id = serializers.IntegerField(read_only=True)
    last_known_location = serializers.SerializerMethodField()
    risk = serializers.SerializerMethodField()

    class Meta:
        model = SafetyAlert
        fields = ["id", "journey_id", "incident_id", "alert_type", "severity", "reason", "created_at", "delivery_status", "delivered_at", "last_known_location", "risk"]

    def get_last_known_location(self, alert):
        return alert.incident.last_known_location if alert.incident_id else {}

    def get_risk(self, alert):
        return alert.incident.risk_snapshot if alert.incident_id else {}
