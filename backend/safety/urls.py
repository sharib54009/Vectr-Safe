from django.urls import path

from .views import SafetyAlertDetailView, SafetyAlertListView


urlpatterns = [
    path("safety/alerts/", SafetyAlertListView.as_view(), name="safety-alert-list"),
    path("safety/alerts/<int:alert_id>/", SafetyAlertDetailView.as_view(), name="safety-alert-detail"),
]
