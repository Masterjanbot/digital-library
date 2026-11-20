"""Download statistics API for the admin dashboard and the personal dashboard.

Two event sources are involved and are deliberately not conflated:

* ``Book.download_count`` — authoritative all-time counter of successful
  downloads, incremented atomically inside the download transaction. Used for
  the headline "total downloads" figures.
* ``DownloadEvent`` — one row per actual successful download (introduced
  together with the unique ``(user, book)`` history model ``Download``).
  Used for per-user/per-book event counts, unique-user counts, daily charts
  and recent activity. Pre-migration history rows were backfilled with one
  event each (lower bound for repeats, which were never recorded).

``Download`` (unique per user/book) is used for "unique books downloaded".
Preview/read requests (``GET .../document/``) never create events and never
increment counters; blocked downloads raise before the transaction runs.
"""

from datetime import timedelta

from django.contrib.auth import get_user_model
from django.db.models import (
    BigIntegerField, Count, Exists, F, IntegerField,
    Max, OuterRef, Q, Subquery, Sum, Value, Window,
)
from django.db.models.functions import Coalesce, Rank, TruncDate
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema, extend_schema_field
from rest_framework import generics, serializers
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.books.models import Book, DownloadEvent

User = get_user_model()


class IsAdminRole(BasePermission):
    """Allow only superusers and users with the ``admin`` role."""

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated
            and (user.is_superuser or user.role == User.Role.ADMIN)
        )


def _clean_search(request):
    value = (request.query_params.get("search") or "").strip()
    if len(value) > 200:
        raise ValidationError({"search": "Search query must be 200 characters or fewer."})
    return value


def _ordering(request, allowed, default):
    value = (request.query_params.get("ordering") or "").strip() or default
    descending = value.startswith("-")
    field = value[1:] if descending else value
    if field not in allowed:
        raise ValidationError({"ordering": f"Unsupported ordering field. Allowed: {', '.join(sorted(allowed))}."})
    return ("-" if descending else "") + field


def _author_names(book):
    return [author.name for author in book.authors.all()]


def annotated_book_stats():
    """Books annotated with download analytics (no row multiplication)."""
    return (
        Book.objects.select_related("category", "publisher")
        .prefetch_related("authors")
        .annotate(
            unique_users=Count("download_events__user", distinct=True),
            last_download_at=Max("download_events__downloaded_at"),
            rank=Window(expression=Rank(), order_by=F("download_count").desc()),
        )
    )


def _apply_book_search(queryset, search):
    if not search:
        return queryset
    author_match = Book.objects.filter(pk=OuterRef("pk"), authors__name__icontains=search)
    return queryset.filter(
        Q(title__icontains=search)
        | Q(subtitle__icontains=search)
        | Q(isbn__icontains=search)
        | Exists(author_match)
    )


class BookStatRowSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    title = serializers.CharField()
    authors = serializers.SerializerMethodField()
    category_name = serializers.CharField(source="category.name", allow_null=True, required=False, default=None)
    is_premium = serializers.BooleanField()
    downloads = serializers.IntegerField(source="download_count")
    unique_users = serializers.IntegerField()
    last_download_at = serializers.DateTimeField(allow_null=True)
    rank = serializers.IntegerField()

    @extend_schema_field({"type": "array", "items": {"type": "string"}})
    def get_authors(self, obj):
        return _author_names(obj)


class UserStatRowSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    username = serializers.CharField()
    email = serializers.CharField()
    full_name = serializers.SerializerMethodField()
    role = serializers.CharField()
    total_events = serializers.IntegerField()
    unique_books = serializers.IntegerField()
    most_recent_book = serializers.CharField(allow_null=True)
    last_download_at = serializers.DateTimeField(allow_null=True)
    date_joined = serializers.DateTimeField()

    @extend_schema_field(OpenApiTypes.STR)
    def get_full_name(self, obj):
        name = f"{obj.first_name} {obj.last_name}".strip()
        return name or obj.username


class DownloadEventRowSerializer(serializers.Serializer):
    id = serializers.IntegerField()
    book = serializers.IntegerField(source="book_id")
    book_title = serializers.CharField(source="book.title")
    book_author = serializers.SerializerMethodField()
    is_premium = serializers.BooleanField(source="book.is_premium")
    downloaded_at = serializers.DateTimeField()
    times_downloaded = serializers.IntegerField()

    @extend_schema_field({"type": "array", "items": {"type": "string"}})
    def get_book_author(self, obj):
        return _author_names(obj.book)


def _times_downloaded(user_ref, book_ref):
    return (
        DownloadEvent.objects.filter(user=user_ref, book=book_ref)
        .order_by()
        .values("user", "book")
        .annotate(total=Count("pk"))
        .values("total")
    )


def _downloads_by_day(events, days=30):
    today = timezone.now().date()
    start = today - timedelta(days=days - 1)
    rows = (
        events.filter(downloaded_at__date__gte=start)
        .annotate(day=TruncDate("downloaded_at"))
        .values("day")
        .annotate(count=Count("id"))
    )
    counts = {row["day"]: row["count"] for row in rows}
    return [
        {"day": (start + timedelta(days=offset)).isoformat(), "count": counts.get(start + timedelta(days=offset), 0)}
        for offset in range(days)
    ]


class AdminDownloadStatsOverviewView(APIView):
    permission_classes = [IsAdminRole]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        events = DownloadEvent.objects.all()
        books = annotated_book_stats()
        book_rows = list(books.order_by("-download_count", "title", "id")[:5])
        least_rows = list(books.order_by("download_count", "title", "id")[:5])
        recent_events = events.select_related("user", "book").order_by("-downloaded_at", "-id")[:10]
        payload = {
            "total_download_events": Book.objects.aggregate(total=Sum("download_count"))["total"] or 0,
            "total_downloaded_books": Book.objects.filter(download_count__gt=0).count(),
            "total_downloading_users": events.values("user").distinct().count(),
            "total_download_events_recorded": events.count(),
            "most_downloaded": BookStatRowSerializer(book_rows, many=True).data,
            "least_downloaded": BookStatRowSerializer(least_rows, many=True).data,
            "recent_activity": [
                {
                    "id": event.id,
                    "user_id": event.user_id,
                    "username": event.user.username,
                    "book_id": event.book_id,
                    "book_title": event.book.title,
                    "downloaded_at": event.downloaded_at,
                }
                for event in recent_events
            ],
            "downloads_by_day": _downloads_by_day(events),
        }
        return Response(payload)


class AdminBookDownloadStatsView(generics.ListAPIView):
    permission_classes = [IsAdminRole]
    serializer_class = BookStatRowSerializer

    ALLOWED_ORDERING = {"downloads", "title", "unique_users", "last_download_at", "rank"}
    ORDERING_MAP = {
        "downloads": "download_count",
        "rank": "rank",
        "title": "title",
        "unique_users": "unique_users",
        "last_download_at": "last_download_at",
    }

    def get_queryset(self):
        ordering = _ordering(self.request, self.ALLOWED_ORDERING, "-downloads")
        field = self.ORDERING_MAP[ordering.lstrip("-")]
        direction = "-" if ordering.startswith("-") else ""
        queryset = annotated_book_stats()
        queryset = _apply_book_search(queryset, _clean_search(self.request))
        return queryset.order_by(f"{direction}{field}", "id")


class AdminUserDownloadStatsView(generics.ListAPIView):
    permission_classes = [IsAdminRole]
    serializer_class = UserStatRowSerializer

    ALLOWED_ORDERING = {"username", "total_events", "unique_books", "last_download_at", "date_joined"}

    def get_queryset(self):
        event_counts = (
            DownloadEvent.objects.filter(user=OuterRef("pk"))
            .order_by()
            .values("user")
            .annotate(total=Count("pk"))
            .values("total")
        )
        latest_title = (
            DownloadEvent.objects.filter(user=OuterRef("pk"))
            .order_by("-downloaded_at", "-id")
            .values("book__title")[:1]
        )
        queryset = (
            User.objects.filter(Exists(DownloadEvent.objects.filter(user=OuterRef("pk"))))
            .annotate(
                total_events=Coalesce(Subquery(event_counts, output_field=BigIntegerField()), Value(0)),
                unique_books=Count("download_events__book", distinct=True),
                last_download_at=Max("download_events__downloaded_at"),
                most_recent_book=Subquery(latest_title),
            )
        )
        search = _clean_search(self.request)
        if search:
            book_match = DownloadEvent.objects.filter(user=OuterRef("pk")).filter(
                Q(book__title__icontains=search) | Q(book__authors__name__icontains=search)
            )
            queryset = queryset.filter(
                Q(username__icontains=search)
                | Q(email__icontains=search)
                | Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Exists(book_match)
            )
        ordering = _ordering(self.request, self.ALLOWED_ORDERING, "-last_download_at")
        return queryset.order_by(ordering, "id")


class AdminUserDownloadHistoryView(generics.ListAPIView):
    permission_classes = [IsAdminRole]
    serializer_class = DownloadEventRowSerializer
    queryset = DownloadEvent.objects.none()

    def get_queryset(self):
        user = get_object_or_404(User, pk=self.kwargs["user_id"])
        events = (
            DownloadEvent.objects.filter(user=user)
            .select_related("book", "book__category", "book__publisher")
            .prefetch_related("book__authors")
        )
        search = _clean_search(self.request)
        if search:
            events = events.filter(
                Q(book__title__icontains=search) | Q(book__authors__name__icontains=search)
            ).distinct()
        return events.annotate(
            times_downloaded=Subquery(
                _times_downloaded(OuterRef("user"), OuterRef("book")),
                output_field=IntegerField(),
            )
        ).order_by("-downloaded_at", "-id")


class MyDownloadStatsView(APIView):
    permission_classes = [IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        events = DownloadEvent.objects.filter(user=request.user)
        recent_events = (
            events.select_related("book")
            .prefetch_related("book__authors")
            .annotate(
                times_downloaded=Subquery(
                    _times_downloaded(OuterRef("user"), OuterRef("book")),
                    output_field=IntegerField(),
                )
            )
            .order_by("-downloaded_at", "-id")[:10]
        )
        return Response({
            "total_events": events.count(),
            "unique_books": events.values("book").distinct().count(),
            "recent": DownloadEventRowSerializer(recent_events, many=True).data,
            "downloads_by_day": _downloads_by_day(events),
        })
