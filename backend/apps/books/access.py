from django.db.models import Q
from django.utils import timezone
from apps.subscriptions.models import Subscription


def has_active_premium(user):
    if user.is_superuser or user.role in {"admin", "librarian", "editor"}:
        return True
    return Subscription.objects.filter(
        user=user, plan=Subscription.Plan.PREMIUM, status=Subscription.Status.ACTIVE,
    ).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())).exists()


def can_access_book(book, user):
    is_catalog_manager = user.is_authenticated and (
        user.is_superuser or user.role in {"admin", "librarian", "editor"}
    )
    is_owner = user.is_authenticated and book.created_by_id == user.id
    if book.status != "published" and not (is_catalog_manager or is_owner):
        return False
    if book.visibility != "public" and not (is_catalog_manager or is_owner):
        return False
    return not book.is_premium or (user.is_authenticated and has_active_premium(user))


def can_download_book(book, user):
    """Return True only for confirmed successful access: authenticated + published + visible + (free or premium-confirmed)."""
    if not user or not user.is_authenticated:
        return False
    if not can_access_book(book, user):
        return False
    if not book.document:
        return False
    return True