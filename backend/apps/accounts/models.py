from django.contrib.auth.models import AbstractUser
from django.db import models
from django.db.models import Q
from django.db.models.functions import Lower

class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "Administrator"
        LIBRARIAN = "librarian", "Librarian"
        EDITOR = "editor", "Editor"
        PREMIUM = "premium", "Premium User"
        USER = "user", "Normal User"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.USER, db_index=True)
    preferred_language = models.CharField(max_length=5, choices=[("en", "English"), ("fa", "Persian")], default="en")

    class Meta:
        verbose_name = "user"
        verbose_name_plural = "users"
        constraints = [
            models.UniqueConstraint(
                Lower("email"),
                condition=~Q(email=""),
                name="accounts_user_email_ci_unique",
            ),
        ]

    @property
    def is_super_admin(self):
        return self.is_superuser
