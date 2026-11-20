from django.db import migrations, models
from django.db.models import Count, Q
from django.db.models.functions import Lower


def ensure_email_uniqueness(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    duplicates = (
        User.objects.using(schema_editor.connection.alias)
        .exclude(email="")
        .annotate(normalized_email=Lower("email"))
        .values("normalized_email")
        .annotate(total=Count("pk"))
        .filter(total__gt=1)
    )
    if duplicates.exists():
        raise RuntimeError(
            "Cannot add case-insensitive email uniqueness: duplicate non-empty user emails exist. "
            "Resolve the duplicate accounts without deleting users, then rerun migrations."
        )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0001_initial"),
    ]

    operations = [
        migrations.RunPython(ensure_email_uniqueness, migrations.RunPython.noop),
        migrations.AddConstraint(
            model_name="user",
            constraint=models.UniqueConstraint(
                Lower("email"),
                condition=~Q(email=""),
                name="accounts_user_email_ci_unique",
            ),
        ),
    ]
