import django.db.models.deletion
from django.db import migrations, models
from django.utils import timezone

import safety.models


def update_legacy_statuses(apps, schema_editor):
    CheckIn = apps.get_model("safety", "SafetyCheckIn")
    CheckIn.objects.filter(status="SAFE").update(status="RESPONDED_SAFE")
    CheckIn.objects.filter(status="HELP").update(status="RESPONDED_HELP")
    CheckIn.objects.filter(status="CANNOT_RESPOND").update(status="RESPONDED_CANNOT_RESPOND")
    CheckIn.objects.filter(deadline__isnull=True).update(deadline=timezone.now())
    Alert = apps.get_model("safety", "SafetyAlert")
    Alert.objects.filter(delivery_status="PENDING").update(delivery_status="NOT_CONFIGURED")
    SOS = apps.get_model("safety", "SOS")
    SOS.objects.filter(delivery_status="PENDING").update(delivery_status="NOT_CONFIGURED")


class Migration(migrations.Migration):
    dependencies = [
        ("journeys", "0005_alter_journey_status"),
        ("safety", "0002_safetycheckin_one_pending_checkin_per_journey"),
    ]

    operations = [
        migrations.RemoveConstraint(
            model_name="safetycheckin",
            name="one_pending_checkin_per_journey",
        ),
        migrations.RenameField("safetycheckin", "requested_at", "created_at"),
        migrations.RenameField("safetycheckin", "response_at", "responded_at"),
        migrations.RenameField("safetycheckin", "response_status", "status"),
        migrations.RunPython(update_legacy_statuses, migrations.RunPython.noop),
        migrations.AddField(
            model_name="safetycheckin",
            name="missed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="safetycheckin",
            name="response",
            field=models.CharField(blank=True, max_length=20),
        ),
        migrations.AddField(
            model_name="safetycheckin",
            name="reason",
            field=models.CharField(default="Several persistent movement signals raised the risk state.", max_length=255),
        ),
        migrations.AddField(
            model_name="safetycheckin",
            name="updated_at",
            field=models.DateTimeField(default=timezone.now),
        ),
        migrations.AlterField(
            model_name="safetycheckin",
            name="deadline",
            field=models.DateTimeField(default=safety.models.default_checkin_deadline),
        ),
        migrations.AlterField(
            model_name="safetycheckin",
            name="status",
            field=models.CharField(choices=[("PENDING", "Pending"), ("RESPONDED_SAFE", "Responded safe"), ("RESPONDED_HELP", "Responded and requested help"), ("RESPONDED_CANNOT_RESPOND", "Could not respond"), ("MISSED", "Missed"), ("ESCALATED", "Escalated"), ("CANCELLED", "Cancelled")], default="PENDING", max_length=30),
        ),
        migrations.CreateModel(
            name="SafetyIncident",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("incident_type", models.CharField(max_length=40)),
                ("severity", models.CharField(default="HIGH", max_length=10)),
                ("reason", models.CharField(max_length=255)),
                ("last_known_location", models.JSONField(blank=True, default=dict)),
                ("risk_snapshot", models.JSONField(blank=True, default=dict)),
                ("status", models.CharField(choices=[("OPEN", "Open"), ("RESOLVED", "Resolved")], default="OPEN", max_length=12)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("check_in", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="incident", to="safety.safetycheckin")),
                ("journey", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="incidents", to="journeys.journey")),
                ("sos", models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="incident", to="safety.sos")),
            ],
        ),
        migrations.AddConstraint(
            model_name="safetyincident",
            constraint=models.CheckConstraint(condition=models.Q(check_in__isnull=False) | models.Q(sos__isnull=False), name="incident_has_checkin_or_sos_source"),
        ),
        migrations.AddField(
            model_name="safetyalert",
            name="incident",
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="alert", to="safety.safetyincident"),
        ),
        migrations.AddField(
            model_name="safetyalert",
            name="severity",
            field=models.CharField(default="HIGH", max_length=10),
        ),
        migrations.AlterField(
            model_name="safetyalert",
            name="delivery_status",
            field=models.CharField(choices=[("PENDING", "Pending"), ("SENT", "Sent"), ("DELIVERED", "Delivered"), ("FAILED", "Failed"), ("NOT_CONFIGURED", "External delivery not configured")], default="NOT_CONFIGURED", max_length=20),
        ),
        migrations.AlterField(
            model_name="sos",
            name="delivery_status",
            field=models.CharField(choices=[("PENDING", "Pending"), ("SENT", "Sent"), ("DELIVERED", "Delivered"), ("FAILED", "Failed"), ("NOT_CONFIGURED", "External delivery not configured")], default="NOT_CONFIGURED", max_length=20),
        ),
        migrations.AddField(
            model_name="sos",
            name="idempotency_key",
            field=models.CharField(blank=True, default="", max_length=64),
        ),
        migrations.AddConstraint(
            model_name="sos",
            constraint=models.UniqueConstraint(condition=~models.Q(idempotency_key=""), fields=("journey", "idempotency_key"), name="unique_sos_idempotency_per_journey"),
        ),
        migrations.AddConstraint(
            model_name="safetycheckin",
            constraint=models.UniqueConstraint(condition=models.Q(status="PENDING"), fields=("journey",), name="one_pending_checkin_per_journey"),
        ),
    ]
