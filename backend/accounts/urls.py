from django.urls import path

from .views import (
    AcceptGuardianInvitationView,
    CurrentUserView,
    LoginView,
    LogoutView,
    SignupView,
    TrustedContactDeleteView,
    TrustedContactListCreateView,
    csrf_cookie,
)


urlpatterns = [
    path("auth/csrf/", csrf_cookie, name="auth-csrf"),
    path("auth/signup/", SignupView.as_view(), name="auth-signup"),
    path("auth/login/", LoginView.as_view(), name="auth-login"),
    path("auth/me/", CurrentUserView.as_view(), name="auth-me"),
    path("auth/logout/", LogoutView.as_view(), name="auth-logout"),
    path("trusted-contacts/", TrustedContactListCreateView.as_view(), name="trusted-contact-list-create"),
    path("trusted-contacts/<int:contact_id>/", TrustedContactDeleteView.as_view(), name="trusted-contact-delete"),
    path("guardian-invitations/accept/", AcceptGuardianInvitationView.as_view(), name="guardian-invitation-accept"),
]
