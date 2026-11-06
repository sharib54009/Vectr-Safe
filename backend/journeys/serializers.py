from rest_framework import serializers

from .models import Journey, LocationSample


class LocationSampleSerializer(serializers.ModelSerializer):
    client_sample_id = serializers.UUIDField(required=False, allow_null=True)
    latitude = serializers.FloatField(min_value=-90, max_value=90)
    longitude = serializers.FloatField(min_value=-180, max_value=180)
    accuracy_meters = serializers.FloatField(min_value=0, required=False, allow_null=True)
    speed_meters_per_second = serializers.FloatField(min_value=0, required=False, allow_null=True)
    heading_degrees = serializers.FloatField(min_value=0, max_value=360, required=False, allow_null=True)
    altitude_meters = serializers.FloatField(required=False, allow_null=True)

    class Meta:
        model = LocationSample
        fields = ["id", "client_sample_id", "latitude", "longitude", "timestamp", "accuracy_meters", "altitude_meters", "speed_meters_per_second", "heading_degrees"]
        read_only_fields = ["id"]


class JourneySerializer(serializers.ModelSerializer):
    class Meta:
        model = Journey
        fields = ["id", "origin", "destination", "status", "started_at", "expected_arrival_at", "estimated_arrival_at", "remaining_distance_meters", "ended_at", "planned_route", "origin_location", "destination_location", "current_risk_state", "current_risk_score", "highest_risk_state"]
        read_only_fields = ["id", "status", "started_at", "estimated_arrival_at", "remaining_distance_meters", "ended_at", "current_risk_state", "current_risk_score", "highest_risk_state"]

    def validate_planned_route(self, route):
        for point in route:
            if not isinstance(point, dict) or not {"latitude", "longitude"}.issubset(point):
                raise serializers.ValidationError("Each route point needs latitude and longitude.")
            try:
                latitude, longitude = float(point["latitude"]), float(point["longitude"])
            except (TypeError, ValueError):
                raise serializers.ValidationError("Route coordinates must be numbers.")
            if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
                raise serializers.ValidationError("Route coordinates are outside valid ranges.")
        return route

    def validate_origin_location(self, location):
        return self._validate_location(location)

    def validate_destination_location(self, location):
        return self._validate_location(location)

    @staticmethod
    def _validate_location(location):
        if not location:
            return {}
        if not isinstance(location, dict) or not {"latitude", "longitude"}.issubset(location):
            raise serializers.ValidationError("Location needs latitude and longitude.")
        try:
            latitude, longitude = float(location["latitude"]), float(location["longitude"])
        except (TypeError, ValueError):
            raise serializers.ValidationError("Location coordinates must be numbers.")
        if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
            raise serializers.ValidationError("Location coordinates are outside valid ranges.")
        return {"latitude": latitude, "longitude": longitude}
