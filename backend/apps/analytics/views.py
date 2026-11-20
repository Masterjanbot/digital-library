from django.contrib.auth import get_user_model
from django.db.models import Count, Sum
from django.db.models import Q
from django.utils import timezone
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from apps.books.models import Book
from apps.reading_progress.models import ReadingProgress
from apps.subscriptions.models import Subscription

User = get_user_model()

class DashboardView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        user = request.user
        if user.is_superuser or user.role in {"admin", "librarian", "editor"}:
            books = Book.objects.all()
            reading_activity = ReadingProgress.objects.filter(book__in=books)
            data = {
                "role": user.role,
                "can_manage_catalog": True,
                "total_users": User.objects.count(),
                "total_books": books.count(),
                "published_books": books.filter(status=Book.Status.PUBLISHED).count(),
                "draft_books": books.filter(status=Book.Status.DRAFT).count(),
                "total_readers": reading_activity.values("user_id").distinct().count(),
                "total_reading_activity": reading_activity.count(),
                "active_subscriptions": Subscription.objects.filter(
                    status=Subscription.Status.ACTIVE,
                ).filter(Q(expires_at__isnull=True) | Q(expires_at__gt=timezone.now())).count(),
                "recent_books": list(Book.objects.order_by("-created_at").values("id", "title", "created_at")[:5]),
                "categories": list(Book.objects.values("category__name").annotate(total=Count("id")).order_by("-total")[:5]),
            }
            if user.is_superuser or user.role == "admin":
                data["total_downloads"] = Book.objects.aggregate(total=Sum("download_count"))["total"] or 0
            data["recent_activity"] = list(
                ReadingProgress.objects.filter(user=user)
                .select_related("user", "book")
                .order_by("-last_read_at")
                .values("user__username", "book__id", "book__title", "current_page", "last_read_at")[:8]
            )
            return Response(data)
        progress = ReadingProgress.objects.filter(user=user).select_related("book")
        my_books = Book.objects.filter(created_by=user)
        own_reading_activity = ReadingProgress.objects.filter(book__in=my_books)
        return Response({
            "role": user.role,
            "can_manage_catalog": False,
            "total_books": my_books.count(),
            "published_books": my_books.filter(status=Book.Status.PUBLISHED).count(),
            "draft_books": my_books.filter(status=Book.Status.DRAFT).count(),
            "total_readers": own_reading_activity.values("user_id").distinct().count(),
            "total_reading_activity": own_reading_activity.count(),
            "recent_books": list(my_books.order_by("-created_at").values("id", "title", "created_at")[:5]),
            "recent_activity": list(
                progress.select_related("user", "book")
                .order_by("-last_read_at")
                .values("user__username", "book__id", "book__title", "current_page", "last_read_at")[:8]
            ),
            "books_in_progress": progress.count(),
            "continue_reading": [
                {"book_id": item.book_id, "title": item.book.title, "page": item.current_page,
                 "percentage": item.percentage, "last_read_at": item.last_read_at}
                for item in progress[:8]
            ],
            "bookmarks": user.bookmarks.count(),
            "notes": user.notes.count(),
            "subscription": Subscription.objects.filter(user=user).values("plan", "status", "starts_at", "expires_at").first(),
        })
