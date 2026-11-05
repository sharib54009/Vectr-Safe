from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("journeys", "0004_locationsample_journey_location_time_idx")]

    operations = [
        migrations.AlterField(
            model_name="journey",
            name="status",
            field=models.CharField(
                choices=[
                    ("ACTIVE", "Active"),
                    ("HIGH_RISK", "High risk"),
                    ("ESCALATED", "Escalated"),
                    ("COMPLETED", "Completed"),
                    ("CANCELLED", "Cancelled"),
                ],
                default="ACTIVE",
                max_length=16,
            ),
        ),
    ]
