from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework.response import Response
from rest_framework.views import APIView

from journeys.models import Journey
from journeys.views import guardian_journeys
from .models import SafetyAlert
from .serializers import SafetyAlertSerializer


def authorized_alerts(user):
    journeys = Journey.objects.filter(
        Q(user=user)
        | Q(
            user__trusted_contacts__guardian_user=user,
            user__trusted_contacts__is_active=True,
            user__trusted_contacts__accepted_at__isnull=False,
        )
    ).distinct()
    return SafetyAlert.objects.filter(journey__in=journeys).select_related("incident", "journey").order_by("-created_at")


class SafetyAlertListView(APIView):
    def get(self, request):
        alerts = authorized_alerts(request.user)
        return Response(SafetyAlertSerializer(alerts, many=True).data)


class SafetyAlertDetailView(APIView):
    def get(self, request, alert_id):
        alert = get_object_or_404(authorized_alerts(request.user), pk=alert_id)
        return Response(SafetyAlertSerializer(alert).data)
