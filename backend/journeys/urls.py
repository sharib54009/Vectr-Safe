from django.urls import path

from .views import (
    CheckInResponseView,
    GuardianJourneyDetailView,
    GuardianJourneyListView,
    GuardianTrustedContactListView,
    JourneyCheckInListView,
    JourneyDetailView,
    JourneyListCreateView,
    JourneyLocationView,
    JourneyCompleteView,
    JourneyCancelView,
    SOSView,
)

urlpatterns = [
    path("journeys/", JourneyListCreateView.as_view(), name="journey-list-create"),
    path("journeys/<int:journey_id>/", JourneyDetailView.as_view(), name="journey-detail"),
    path("journeys/<int:journey_id>/locations/", JourneyLocationView.as_view(), name="journey-locations"),
    path("journeys/<int:journey_id>/complete/", JourneyCompleteView.as_view(), name="journey-complete"),
    path("journeys/<int:journey_id>/cancel/", JourneyCancelView.as_view(), name="journey-cancel"),
    path("journeys/<int:journey_id>/check-ins/", JourneyCheckInListView.as_view(), name="journey-check-ins"),
    path("journeys/<int:journey_id>/check-in/respond/", CheckInResponseView.as_view(), name="journey-check-in-response"),
    path("journeys/<int:journey_id>/sos/", SOSView.as_view(), name="journey-sos"),
    path("guardian/contacts/", GuardianTrustedContactListView.as_view(), name="guardian-contact-list"),
    path("guardian/journeys/", GuardianJourneyListView.as_view(), name="guardian-journeys"),
    path("guardian/journeys/<int:journey_id>/", GuardianJourneyDetailView.as_view(), name="guardian-journey-detail"),
]
