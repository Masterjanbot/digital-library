from django.db import migrations, models


def replace_dari_preferences(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.using(schema_editor.connection.alias).filter(preferred_language="prs").update(
        preferred_language="en",
    )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0002_user_email_ci_unique"),
    ]

    operations = [
        migrations.RunPython(replace_dari_preferences, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="user",
            name="preferred_language",
            field=models.CharField(
                choices=[("en", "English"), ("fa", "Persian")],
                default="en",
                max_length=5,
            ),
        ),
    ]
