import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase
from django.urls import reverse
from rest_framework.test import APIClient

from .models import TrustedContact


class AuthenticationTests(TestCase):
    def test_signup_rejects_missing_fields_weak_password_and_duplicates(self):
        client = APIClient()
        missing = client.post(reverse("auth-signup"), {}, format="json")
        weak_password = client.post(reverse("auth-signup"), {
            "username": "new-rider", "email": "new@example.com", "password": "short",
        }, format="json")
        self.assertEqual(missing.status_code, 400)
        self.assertEqual(weak_password.status_code, 400)

        get_user_model().objects.create_user(
            username="existing-rider", email="existing@example.com", password="Strong-Unique-Password-247!",
        )
        duplicate_username = client.post(reverse("auth-signup"), {
            "username": "existing-rider", "email": "different@example.com", "password": "Strong-Unique-Password-248!",
        }, format="json")
        duplicate_email = client.post(reverse("auth-signup"), {
            "username": "different-rider", "email": "existing@example.com", "password": "Strong-Unique-Password-248!",
        }, format="json")
        self.assertEqual(duplicate_username.status_code, 400)
        self.assertEqual(duplicate_email.status_code, 400)
        self.assertEqual(get_user_model().objects.count(), 1)

    def test_login_rejects_missing_or_incorrect_credentials(self):
        client = APIClient()
        missing = client.post(reverse("auth-login"), {}, format="json")
        incorrect = client.post(reverse("auth-login"), {
            "username": "unknown-rider", "password": "incorrect-password",
        }, format="json")
        self.assertEqual(missing.status_code, 400)
        self.assertEqual(incorrect.status_code, 400)

    def test_signup_requires_csrf_and_creates_authenticated_session(self):
        client = Client(enforce_csrf_checks=True)
        csrf_response = client.get(reverse("auth-csrf"))
        self.assertEqual(csrf_response.status_code, 200)
        csrf_token = client.cookies["csrftoken"].value
        payload = {
            "username": "new-rider",
            "email": "rider@example.com",
            "first_name": "Rider",
            "password": "Strong-Unique-Password-247!",
        }
        denied = Client(enforce_csrf_checks=True).post(reverse("auth-signup"), data=json.dumps(payload), content_type="application/json")
        self.assertEqual(denied.status_code, 403)
        created = client.post(
            reverse("auth-signup"), data=json.dumps(payload), content_type="application/json",
            HTTP_X_CSRFTOKEN=csrf_token,
        )
        self.assertEqual(created.status_code, 201, created.content)
        self.assertEqual(client.get(reverse("auth-me")).json()["username"], "new-rider")
        self.assertEqual(get_user_model().objects.filter(username="new-rider").count(), 1)

    def test_login_and_logout_use_django_session(self):
        user = get_user_model().objects.create_user(
            username="rider", email="rider@example.com", password="Strong-Unique-Password-247!",
        )
        client = Client(enforce_csrf_checks=True)
        client.get(reverse("auth-csrf"))
        token = client.cookies["csrftoken"].value
        logged_in = client.post(
            reverse("auth-login"),
            data=json.dumps({"username": "rider", "password": "Strong-Unique-Password-247!"}),
            content_type="application/json",
            HTTP_X_CSRFTOKEN=token,
        )
        self.assertEqual(logged_in.status_code, 200)
        self.assertEqual(client.get(reverse("auth-me")).json()["id"], user.id)
        token = client.cookies["csrftoken"].value
        logged_out = client.post(reverse("auth-logout"), data="{}", content_type="application/json", HTTP_X_CSRFTOKEN=token)
        self.assertEqual(logged_out.status_code, 204)
        self.assertEqual(client.get(reverse("auth-me")).status_code, 403)


class TrustedContactTests(TestCase):
    def setUp(self):
        user_model = get_user_model()
        self.rider = user_model.objects.create_user(username="rider", email="rider@example.com", password="secret")
        self.guardian = user_model.objects.create_user(username="guardian", email="guardian@example.com", password="secret")
        self.wrong_email = user_model.objects.create_user(username="wrong", email="wrong@example.com", password="secret")

    def test_rider_creates_and_revokes_contact_invitation(self):
        client = APIClient()
        client.force_authenticate(self.rider)
        created = client.post(reverse("trusted-contact-list-create"), {
            "name": "Guardian", "email": self.guardian.email, "phone": "5550100",
        }, format="json")
        self.assertEqual(created.status_code, 201)
        self.assertTrue(created.json()["invitation_code"])
        self.assertEqual(client.get(reverse("trusted-contact-list-create")).json()[0]["email"], self.guardian.email)
        removed = client.delete(reverse("trusted-contact-delete", args=[created.json()["id"]]))
        self.assertEqual(removed.status_code, 204)
        self.assertEqual(client.get(reverse("trusted-contact-list-create")).json(), [])

    def test_invitation_requires_matching_email_and_is_single_use(self):
        contact = TrustedContact.objects.create(user=self.rider, name="Guardian", email=self.guardian.email)
        client = APIClient()
        client.force_authenticate(self.wrong_email)
        mismatch = client.post(reverse("guardian-invitation-accept"), {"invitation_code": contact.invitation_code}, format="json")
        self.assertEqual(mismatch.status_code, 403)
        client.force_authenticate(self.guardian)
        accepted = client.post(reverse("guardian-invitation-accept"), {"invitation_code": contact.invitation_code}, format="json")
        self.assertEqual(accepted.status_code, 200)
        contact.refresh_from_db()
        self.assertEqual(contact.guardian_user, self.guardian)
        self.assertIsNotNone(contact.accepted_at)
        repeated = client.post(reverse("guardian-invitation-accept"), {"invitation_code": contact.invitation_code}, format="json")
        self.assertEqual(repeated.status_code, 404)
