"""
Session-lifecycle endpoints for reading-session tracking.

All endpoints are authenticated and strictly owner-scoped: a user can only
create/heartbeat/end their own sessions. Admin analytics lives in
apps/analytics/reading_stats.py and is IsAdminRole-gated.
"""
from django.shortcuts import get_object_or_404
from django.utils import timezone
from drf_spectacular.utils import extend_schema
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.books.access import can_access_book
from apps.books.models import Book

from .models import ReadingSession

def _payload(session):
    return {
        "id": session.id,
        "book": session.book_id,
        "started_at": session.started_at.isoformat(),
        "accumulated_seconds": session.accumulated_seconds,
        "active": session.ended_at is None,
    }


class StartReadingSessionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=None, responses={201: dict, 200: dict})
    def post(self, request):
        try:
            book_id = int(request.data.get("book"))
        except (TypeError, ValueError):
            return Response({"detail": "book (integer) is required."}, status=status.HTTP_400_BAD_REQUEST)

        book = get_object_or_404(Book, pk=book_id)
        if not can_access_book(book, request.user):
            return Response({"detail": "This book is not available."}, status=status.HTTP_403_FORBIDDEN)

        now = timezone.now()
        open_session = (
            ReadingSession.objects.filter(user=request.user, book=book, ended_at__isnull=True)
            .order_by("-started_at")
            .first()
        )
        if open_session is not None:
            gap = (now - open_session.last_heartbeat_at).total_seconds()
            if gap <= ReadingSession.REOPEN_WINDOW:
                # Reuse the live session instead of stacking duplicates.
                return Response(_payload(open_session), status=status.HTTP_200_OK)
            # Stale open session: close it without crediting the gap.
            open_session.ended_at = open_session.last_heartbeat_at
            open_session.save(update_fields=["ended_at"])

        session = ReadingSession.objects.create(user=request.user, book=book, started_at=now, last_heartbeat_at=now)
        return Response(_payload(session), status=status.HTTP_201_CREATED)


class ReadingSessionHeartbeatView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=None, responses={200: dict})
    def post(self, request, pk):
        session = get_object_or_404(ReadingSession, pk=pk, user=request.user)
        session, recorded = session.register_heartbeat(timezone.now())
        return Response({**_payload(session), "recorded": recorded}, status=status.HTTP_200_OK)


class EndReadingSessionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    @extend_schema(request=None, responses={200: dict})
    def post(self, request, pk):
        session = get_object_or_404(ReadingSession, pk=pk, user=request.user)
        session = session.end(timezone.now())
        return Response(_payload(session), status=status.HTTP_200_OK)
