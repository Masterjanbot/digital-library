from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("books", "0002_alter_tag_slug"),
    ]

    operations = [
        migrations.AddField(
            model_name="book",
            name="status",
            field=models.CharField(
                choices=[("draft", "Draft"), ("published", "Published")],
                db_index=True,
                default="published",
                max_length=12,
            ),
        ),
    ]
