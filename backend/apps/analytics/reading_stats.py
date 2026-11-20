"""User activity & reading engagement analytics (admin-only).

Aggregates *reading* behavior — not downloads — from ``ReadingSession``
(``apps.reading_progress.models.ReadingSession``), the only durable source
of tracked reading time. All querysets are window-scoped; a session counts
toward the window that contains its ``started_at`` date. Reading seconds are
accumulated server-side from heartbeats only (see the model docstring), so
inactive tabs never inflate these figures.

Engagement tier is ranked, not guessed: readers in the selected window are
ranked by sessions (tiebreak: reading seconds); the top 3 are ``high``, the
next 3 ``medium``, the remainder ``low``.
"""
from datetime import timedelta

from django.db.models import Count, Max, Min, Sum
from django.db.models.functions import ExtractHour, ExtractIsoWeekDay, TruncDate, TruncMonth
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.analytics.download_stats import IsAdminRole
from apps.reading_progress.models import ReadingSession

PERIOD_DAYS = {"7d": 7, "30d": 30, "6m": 183}
FULL_NAME = "user__first_name", "user__last_name"


def _parse_period(request):
    raw = (request.query_params.get("period") or "30d").lower()
    if raw not in PERIOD_DAYS:
        return None, Response({"detail": "period must be one of: 7d, 30d, 6m."}, status=400)
    return raw, None


def _window(period):
    days = PERIOD_DAYS[period]
    today = timezone.localdate()
    start = today - timedelta(days=days - 1)
    end = today + timedelta(days=1)  # exclusive
    prev_end = start
    prev_start = prev_end - timedelta(days=days)
    return start, end, prev_start, prev_end


def _sessions_between(start, end):
    return ReadingSession.objects.filter(started_at__date__gte=start, started_at__date__lt=end)


def _bucket_windows(period, start, end):
    """Return list of (bucket_date, label) for zero-filling."""
    if period == "6m":
        months = []
        cursor = start.replace(day=1)
        while cursor < end:
            months.append(cursor)
            month = cursor.month + 1
            year = cursor.year + (1 if month == 13 else 0)
            cursor = cursor.replace(year=year, month=(month if month <= 12 else 1), day=1)
        return months
    return [start + timedelta(days=i) for i in range((end - start).days)]


def _series(sessions, period, start, end):
    if period == "6m":
        rows = (
            sessions.annotate(bucket=TruncMonth("started_at"))
            .values("bucket")
            .annotate(sessions=Count("id"), active_readers=Count("user", distinct=True), read_seconds=Sum("accumulated_seconds"))
            .order_by("bucket")
        )
        index = {row["bucket"].date().replace(day=1): row for row in rows}
        return [
            {
                "bucket": bucket.isoformat(),
                "sessions": index.get(bucket, {}).get("sessions", 0),
                "active_readers": index.get(bucket, {}).get("active_readers", 0),
                "read_seconds": index.get(bucket, {}).get("read_seconds") or 0,
            }
            for bucket in _bucket_windows(period, start, end)
        ]
    rows = (
        sessions.annotate(bucket=TruncDate("started_at"))
        .values("bucket")
        .annotate(sessions=Count("id"), active_readers=Count("user", distinct=True), read_seconds=Sum("accumulated_seconds"))
        .order_by("bucket")
    )
    index = {row["bucket"]: row for row in rows}
    return [
        {
            "bucket": bucket.isoformat(),
            "sessions": index.get(bucket, {}).get("sessions", 0),
            "active_readers": index.get(bucket, {}).get("active_readers", 0),
            "read_seconds": index.get(bucket, {}).get("read_seconds") or 0,
        }
        for bucket in _bucket_windows(period, start, end)
    ]


def _full_name(row):
    name = " ".join(part for part in (row.get("user__first_name"), row.get("user__last_name")) if part).strip()
    return name or row["user__username"]


def _totals(sessions, prev_sessions, start):
    aggregate = sessions.aggregate(
        total_seconds=Sum("accumulated_seconds"),
        sessions=Count("id"),
        active_readers=Count("user", distinct=True),
        books_opened=Count("book", distinct=True),
    )
    total_seconds = aggregate["total_seconds"] or 0
    total_sessions = aggregate["sessions"]
    prev_aggregate = prev_sessions.aggregate(total_seconds=Sum("accumulated_seconds"))
    prev_seconds = prev_aggregate["total_seconds"] or 0
    users_in_window = list(sessions.values_list("user", flat=True).distinct())

    if users_in_window:
        first_seen = (
            ReadingSession.objects.filter(user__in=users_in_window)
            .values("user")
            .annotate(first=Min("started_at"))
        )
        first_map = {row["user"]: row["first"] for row in first_seen}
        new_readers = sum(1 for user in users_in_window if first_map[user].date() >= start)
        prior_activity = set(
            ReadingSession.objects.filter(user__in=users_in_window, started_at__date__lt=start)
            .values_list("user", flat=True)
            .distinct()
        )
        returning_readers = len(set(users_in_window) & prior_activity)
        current_counts = {row["user"]: row["n"] for row in sessions.values("user").annotate(n=Count("id"))}
        previous_counts = {row["user"]: row["n"] for row in prev_sessions.values("user").annotate(n=Count("id"))}
        declining_readers = sum(1 for user, n in current_counts.items() if previous_counts.get(user, 0) > 2 * n)
    else:
        new_readers = 0
        returning_readers = 0
        declining_readers = 0

    trend_pct = round((total_seconds - prev_seconds) / prev_seconds * 100, 1) if prev_seconds else None
    return {
        "sessions": total_sessions,
        "active_readers": aggregate["active_readers"],
        "read_seconds": total_seconds,
        "books_opened": aggregate["books_opened"],
        "avg_session_seconds": round(total_seconds / total_sessions, 1) if total_sessions else 0,
        "new_readers": new_readers,
        "returning_readers": returning_readers,
        "declining_readers": declining_readers,
        "engagement_trend_pct": trend_pct,
        "prev_read_seconds": prev_seconds,
    }


def _insights(sessions, prev_seconds, total_seconds):
    weekday_row = (
        sessions.annotate(weekday=ExtractIsoWeekDay("started_at"))
        .values("weekday")
        .annotate(count=Count("id"))
        .order_by("-count", "weekday")
        .first()
    )
    hour_counts = list(sessions.annotate(hour=ExtractHour("started_at")).values("hour").annotate(count=Count("id")))
    buckets = {"night": 0, "morning": 0, "afternoon": 0, "evening": 0}
    for row in hour_counts:
        hour = row["hour"]
        bucket = "night" if hour < 6 else "morning" if hour < 12 else "afternoon" if hour < 18 else "evening"
        buckets[bucket] += row["count"]
    peak_period = max(buckets, key=buckets.get) if any(buckets.values()) else None

    category_row = (
        sessions.filter(book__category__name__isnull=False)
        .values("book__category__name")
        .annotate(count=Count("id"))
        .order_by("-count")
        .first()
    )

    if prev_seconds == 0:
        overall_trend = None
    elif total_seconds > prev_seconds * 1.1:
        overall_trend = "up"
    elif total_seconds < prev_seconds * 0.9:
        overall_trend = "down"
    else:
        overall_trend = "flat"

    return {
        "most_active_weekday": weekday_row["weekday"] if weekday_row else None,
        "peak_period": peak_period,
        "most_popular_category": category_row["book__category__name"] if category_row else None,
        "overall_trend": overall_trend,
    }


def _top_readers(sessions):
    rows = list(
        sessions.values("user", "user__username", *FULL_NAME)
        .annotate(
            sessions=Count("id"),
            books=Count("book", distinct=True),
            read_seconds=Sum("accumulated_seconds"),
            days_active=Count(TruncDate("started_at"), distinct=True),
            last_activity=Max("started_at"),
        )
        .order_by("-sessions", "-read_seconds", "user__username")[:8]
    )
    for index, row in enumerate(rows):
        row["full_name"] = _full_name(row)
        row["engagement"] = "high" if index < 3 else "medium" if index < 6 else "low"
    return [
        {
            "id": row["user"],
            "username": row["user__username"],
            "full_name": row["full_name"],
            "sessions": row["sessions"],
            "books": row["books"],
            "read_seconds": row["read_seconds"] or 0,
            "days_active": row["days_active"],
            "last_activity": row["last_activity"].isoformat() if row["last_activity"] else None,
            "engagement": row["engagement"],
        }
        for row in rows
    ]


def _top_categories(sessions, total_sessions):
    rows = (
        sessions.values("book__category__name")
        .annotate(sessions=Count("id"), active_readers=Count("user", distinct=True), read_seconds=Sum("accumulated_seconds"))
        .order_by("-sessions")[:5]
    )
    return [
        {
            "category": row["book__category__name"],
            "sessions": row["sessions"],
            "active_readers": row["active_readers"],
            "read_seconds": row["read_seconds"] or 0,
            "percent": round(row["sessions"] / total_sessions * 100, 1) if total_sessions else 0.0,
        }
        for row in rows
    ]


def _recent_sessions(sessions, limit):
    rows = (
        sessions.select_related("user", "book")
        .order_by("-started_at")[:limit]
    )
    return [
        {
            "id": row.id,
            "username": row.user.username,
            "book_title": row.book.title,
            "started_at": row.started_at.isoformat(),
            "duration_seconds": row.accumulated_seconds,
        }
        for row in rows
    ]


class ReadingActivityOverviewView(APIView):
    """Aggregate reading-engagement analytics for the admin dashboard."""

    permission_classes = [IsAdminRole]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request):
        period, error = _parse_period(request)
        if error is not None:
            return error
        start, end, prev_start, prev_end = _window(period)
        sessions = _sessions_between(start, end)
        prev_sessions = _sessions_between(prev_start, prev_end)
        totals = _totals(sessions, prev_sessions, start)
        total_sessions = totals["sessions"]
        insights = _insights(sessions, totals["prev_read_seconds"], totals["read_seconds"])
        payload = {
            "period": period,
            "granularity": "month" if period == "6m" else "day",
            "range_start": start.isoformat(),
            "range_end": (end - timedelta(days=1)).isoformat(),
            "totals": totals,
            "insights": insights,
            "series": _series(sessions, period, start, end),
            "top_readers": _top_readers(sessions),
            "top_categories": _top_categories(sessions, total_sessions),
            "recent_sessions": _recent_sessions(sessions, 8),
        }
        return Response(payload)


class ReadingActivityUserView(APIView):
    """Per-user reading drill-down for the admin dashboard."""

    permission_classes = [IsAdminRole]

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def get(self, request, user_id):
        period, error = _parse_period(request)
        if error is not None:
            return error
        from django.contrib.auth import get_user_model
        User = get_user_model()
        user = get_object_or_404(User, pk=user_id)

        start, end, prev_start, prev_end = _window(period)
        sessions = _sessions_between(start, end).filter(user=user)
        prev_sessions = _sessions_between(prev_start, prev_end).filter(user=user)

        aggregate = sessions.aggregate(
            sessions=Count("id"),
            read_seconds=Sum("accumulated_seconds"),
            books=Count("book", distinct=True),
            days_active=Count(TruncDate("started_at"), distinct=True),
            last_activity=Max("started_at"),
        )
        prev_seconds = prev_sessions.aggregate(s=Sum("accumulated_seconds"))["s"] or 0
        total_seconds = aggregate["read_seconds"] or 0
        trend_pct = round((total_seconds - prev_seconds) / prev_seconds * 100, 1) if prev_seconds else None
        total_sessions = aggregate["sessions"]

        payload = {
            "period": period,
            "granularity": "month" if period == "6m" else "day",
            "user": {
                "id": user.id,
                "username": user.username,
                "full_name": user.get_full_name() or user.username,
                "role": user.role,
                "date_joined": user.date_joined.isoformat(),
            },
            "totals": {
                "sessions": total_sessions,
                "books_opened": aggregate["books"],
                "read_seconds": total_seconds,
                "avg_session_seconds": round(total_seconds / total_sessions, 1) if total_sessions else 0,
                "days_active": aggregate["days_active"],
                "last_activity": aggregate["last_activity"].isoformat() if aggregate["last_activity"] else None,
                "engagement_trend_pct": trend_pct,
            },
            "series": _series(sessions, period, start, end),
            "recent_sessions": [
                {
                    "id": row.id,
                    "book_title": row.book.title,
                    "started_at": row.started_at.isoformat(),
                    "duration_seconds": row.accumulated_seconds,
                }
                for row in sessions.select_related("book").order_by("-started_at")[:10]
            ],
            "top_categories": _top_categories(sessions, total_sessions)[:5],
        }
        return Response(payload)
