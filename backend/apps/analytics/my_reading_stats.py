"""Personal reading-engagement analytics for the authenticated user.

Mirrors the admin reading analytics (``apps.analytics.reading_stats``) but
scoped strictly to ``request.user`` — no ``user_id`` is ever accepted from the
client, so one reader's statistics can never leak into another reader's
response. All values come from ``ReadingSession`` (validated, server-side
tracked reading time — never downloads, never bare progress rows) and
``ReadingProgress`` (completion criteria: ``percentage >= 100``).

Window totals describe the selected period (``7d`` / ``30d`` / ``6m``);
``lifetime`` aggregates describe the user's whole history. "Consistency" is
the share of calendar days in the selected window with at least one session.
"""
from datetime import timedelta

from django.db.models import Count, Max, Sum
from django.db.models.functions import ExtractIsoWeekDay, TruncDate, TruncMonth
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.analytics.reading_stats import (
    PERIOD_DAYS,
    _bucket_windows,
    _parse_period,
    _sessions_between,
    _window,
)
from apps.books.models import Book
from apps.reading_progress.models import ReadingProgress, ReadingSession


def _series(sessions, period, start, end):
    if period == "6m":
        rows = (
            sessions.annotate(bucket=TruncMonth("started_at"))
            .values("bucket")
            .annotate(sessions=Count("id"), read_seconds=Sum("accumulated_seconds"))
            .order_by("bucket")
        )
        index = {row["bucket"].date().replace(day=1): row for row in rows}
    else:
        rows = (
            sessions.annotate(bucket=TruncDate("started_at"))
            .values("bucket")
            .annotate(sessions=Count("id"), read_seconds=Sum("accumulated_seconds"))
            .order_by("bucket")
        )
        index = {row["bucket"]: row for row in rows}
    return [
        {
            "bucket": bucket.isoformat(),
            "sessions": index.get(bucket, {}).get("sessions", 0),
            "read_seconds": index.get(bucket, {}).get("read_seconds") or 0,
        }
        for bucket in _bucket_windows(period, start, end)
    ]


def _book_payload(book, row, progress_map):
    authors = [author.name for author in book.authors.all()]
    return {
        "id": book.id,
        "title": book.title,
        "authors": authors,
        "cover_url": f"/api/books/{book.id}/cover/" if book.cover else None,
        "read_seconds": row["read_seconds"] or 0,
        "sessions": row["sessions"],
        "progress_percentage": float(progress_map[book.id].percentage) if book.id in progress_map else None,
        "last_read_at": row["last_read_at"].isoformat() if row["last_read_at"] else None,
        "completed": book.id in progress_map and float(progress_map[book.id].percentage) >= 100,
    }


class MyReadingStatsView(APIView):
    """Personal reading activity for the authenticated user (own data only)."""

    permission_classes = [IsAuthenticated]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        period, error = _parse_period(request)
        if error is not None:
            return error
        user = request.user
        days = PERIOD_DAYS[period]
        start, end, prev_start, prev_end = _window(period)

        sessions = _sessions_between(start, end).filter(user=user)
        prev_sessions = _sessions_between(prev_start, prev_end).filter(user=user)
        aggregate = sessions.aggregate(
            sessions=Count("id"),
            total_seconds=Sum("accumulated_seconds"),
            books_opened=Count("book", distinct=True),
            days_active=Count(TruncDate("started_at"), distinct=True),
        )
        total_seconds = aggregate["total_seconds"] or 0
        total_sessions = aggregate["sessions"]
        window_days_active = aggregate["days_active"]
        prev_seconds = prev_sessions.aggregate(s=Sum("accumulated_seconds"))["s"] or 0
        if prev_seconds == 0:
            trend = None
            trend_pct = None
        else:
            trend_pct = round((total_seconds - prev_seconds) / prev_seconds * 100, 1)
            if total_seconds > prev_seconds * 1.1:
                trend = "up"
            elif total_seconds < prev_seconds * 0.9:
                trend = "down"
            else:
                trend = "flat"

        all_sessions = ReadingSession.objects.filter(user=user)
        lifetime_aggregate = all_sessions.aggregate(
            sessions=Count("id"),
            total_seconds=Sum("accumulated_seconds"),
            days_active=Count(TruncDate("started_at"), distinct=True),
        )
        progress_qs = ReadingProgress.objects.filter(user=user)
        lifetime = {
            "books_read": progress_qs.filter(percentage__gte=100).count(),
            "books_in_progress": progress_qs.filter(percentage__lt=100).count(),
            "read_seconds": lifetime_aggregate["total_seconds"] or 0,
            "sessions": lifetime_aggregate["sessions"],
            "days_active": lifetime_aggregate["days_active"],
        }

        category_row = (
            sessions.filter(book__category__name__isnull=False)
            .values("book__category__name")
            .annotate(total=Sum("accumulated_seconds"))
            .order_by("-total")
            .first()
        )
        weekday_row = (
            sessions.annotate(weekday=ExtractIsoWeekDay("started_at"))
            .values("weekday")
            .annotate(count=Count("id"))
            .order_by("-count", "weekday")
            .first()
        )
        frequent_row = all_sessions.values("book").annotate(n=Count("id"), seconds=Sum("accumulated_seconds")).order_by("-n", "-seconds").first()

        # Most read books (lifetime, ranked by validated reading seconds).
        most_read_rows = list(
            all_sessions.values("book")
            .annotate(read_seconds=Sum("accumulated_seconds"), sessions=Count("id"), last_read_at=Max("started_at"))
            .order_by("-read_seconds", "-sessions", "book")[:5]
        )
        book_ids = [row["book"] for row in most_read_rows]
        books = {book.id: book for book in Book.objects.filter(id__in=book_ids).prefetch_related("authors")}
        progress_map = {progress.book_id: progress for progress in progress_qs.filter(book_id__in=book_ids)}
        most_read = [
            _book_payload(books[row["book"]], row, progress_map)
            for row in most_read_rows
            if row["book"] in books
        ]

        # Most frequent book insight (lifetime, by sessions).
        most_frequent_book = None
        if frequent_row is not None:
            frequent_book = Book.objects.filter(id=frequent_row["book"]).first()
            if frequent_book is not None:
                most_frequent_book = {"id": frequent_book.id, "title": frequent_book.title, "sessions": frequent_row["n"]}

        # Recent sessions (own data only).
        recent_rows = list(
            all_sessions.select_related("book").prefetch_related("book__authors").order_by("-started_at")[:8]
        )
        recent_book_ids = {row.book_id for row in recent_rows}
        recent_progress = {progress.book_id: progress for progress in progress_qs.filter(book_id__in=recent_book_ids)}
        recent = [
            {
                "id": row.id,
                "book": row.book_id,
                "book_title": row.book.title,
                "authors": [author.name for author in row.book.authors.all()],
                "cover_url": f"/api/books/{row.book_id}/cover/" if row.book.cover else None,
                "started_at": row.started_at.isoformat(),
                "duration_seconds": row.accumulated_seconds,
                "progress_percentage": float(recent_progress[row.book_id].percentage) if row.book_id in recent_progress else None,
            }
            for row in recent_rows
        ]

        payload = {
            "period": period,
            "granularity": "month" if period == "6m" else "day",
            "range_start": start.isoformat(),
            "range_end": (end - timedelta(days=1)).isoformat(),
            "totals": {
                "read_seconds": total_seconds,
                "sessions": total_sessions,
                "days_active": window_days_active,
                "books_opened": aggregate["books_opened"],
                "avg_session_seconds": round(total_seconds / total_sessions, 1) if total_sessions else 0,
                "avg_daily_seconds": round(total_seconds / days, 1),
                "avg_monthly_seconds": round(total_seconds / 6, 1) if period == "6m" else None,
                "engagement_trend_pct": trend_pct,
            },
            "lifetime": lifetime,
            "insights": {
                "favorite_category": category_row["book__category__name"] if category_row else None,
                "most_active_weekday": weekday_row["weekday"] if weekday_row else None,
                "most_frequent_book": most_frequent_book,
                "consistency_pct": round(window_days_active / days * 100),
                "trend": trend,
                "total_sessions": lifetime["sessions"],
                "completed_books": lifetime["books_read"],
            },
            "series": _series(sessions, period, start, end),
            "most_read": most_read,
            "recent": recent,
        }
        return Response(payload)
