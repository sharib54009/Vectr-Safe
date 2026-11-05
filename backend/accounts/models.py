import secrets

from django.conf import settings
from django.db import models


class TrustedContact(models.Model):
    """A contact explicitly associated with one account."""
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="trusted_contacts")
    name = models.CharField(max_length=120)
    phone = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    relationship = models.CharField(max_length=80, blank=True)
    guardian_user = models.ForeignKey(
        settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True,
        related_name="trusted_for",
    )
    invitation_code = models.CharField(max_length=64, unique=True, null=True, blank=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.name} ({self.user_id})"

    def save(self, *args, **kwargs):
        if not self.invitation_code:
            self.invitation_code = secrets.token_urlsafe(32)
        super().save(*args, **kwargs)
