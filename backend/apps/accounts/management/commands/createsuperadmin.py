import os

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.core.exceptions import ValidationError
class Command(BaseCommand):
    help = "Create or promote a user to Super Administrator using secure prompts or environment variables."

    def handle(self, *args, **options):
        User = get_user_model()
        username = os.getenv("SUPERADMIN_USERNAME") or input("Username: ").strip()
        email = os.getenv("SUPERADMIN_EMAIL") or input("Email: ").strip()
        try:
            validate_email(email)
        except ValidationError as exc:
            raise CommandError("A valid email address is required.") from exc
        password = os.getenv("SUPERADMIN_PASSWORD")
        if not password:
            from getpass import getpass
            password = getpass("Password (min 8 characters): ")
            confirmation = getpass("Confirm password: ")
            if password != confirmation:
                raise CommandError("Passwords do not match.")
        if len(password) < 8:
            raise CommandError("Password must contain at least 8 characters.")
        try:
            validate_password(password, user=User(username=username, email=email))
        except ValidationError as exc:
            raise CommandError("; ".join(exc.messages)) from exc
        user, created = User.objects.get_or_create(username=username, defaults={"email": email})
        if not created and User.objects.exclude(pk=user.pk).filter(email__iexact=email).exists():
            raise CommandError("That email address is already associated with another account.")
        user.email = email
        user.role = User.Role.ADMIN
        user.is_staff = True
        user.is_superuser = True
        user.is_active = True
        user.set_password(password)
        user.save()
        self.stdout.write(self.style.SUCCESS(f"Super Administrator {'created' if created else 'updated'}: {username}"))
