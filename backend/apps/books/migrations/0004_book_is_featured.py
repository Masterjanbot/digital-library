from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("books", "0003_book_status"),
    ]

    operations = [
        migrations.AddField(
            model_name="book",
            name="is_featured",
            field=models.BooleanField(db_index=True, default=False),
        ),
    ]
