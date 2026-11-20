from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models
from django.utils import timezone

class ReadingProgress(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reading_progress")
    book = models.ForeignKey("books.Book", on_delete=models.CASCADE, related_name="reading_progress")
    current_page = models.PositiveIntegerField(default=1, validators=[MinValueValidator(1)])
    percentage = models.DecimalField(max_digits=5, decimal_places=2, default=0)
    last_read_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-last_read_at"]
        constraints = [models.UniqueConstraint(fields=["user", "book"], name="unique_reading_progress_per_user")]


class ReadingSession(models.Model):
    """
    Durable record of a reading session (a user opening a book in the reader).

    Durations are accumulated server-side from heartbeat gaps only — the
    client never reports elapsed time, so backgrounded tabs cannot inflate
    reading time. A session is considered live while its last heartbeat is
    within HEARTBEAT_GAP_MAX; otherwise the next touch closes it without
    crediting the gap. Each heartbeat credits at most HEARTBEAT_CREDIT_MAX
    seconds to smooth timer throttling. MAX_SESSION_SECONDS caps the total
    length of any session as a final safety bound.

    Books downloaded are never counted as reading time; only explicit
    reader sessions are. A ReadingProgress row (current page) does not imply
    a reading session.
    """

    HEARTBEAT_GAP_MAX = 90  # seconds between heartbeats beyond which a session is stale
    HEARTBEAT_CREDIT_MAX = 45  # seconds credited to a single heartbeat gap
    MAX_SESSION_SECONDS = 8 * 60 * 60  # hard cap per session
    REOPEN_WINDOW = 90  # seconds in which a re-opened reader reuses the open session

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="reading_sessions")
    book = models.ForeignKey("books.Book", on_delete=models.CASCADE, related_name="reading_sessions")
    started_at = models.DateTimeField(default=timezone.now)
    last_heartbeat_at = models.DateTimeField(default=timezone.now)
    ended_at = models.DateTimeField(null=True, blank=True, default=None)
    accumulated_seconds = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["-started_at"]
        indexes = [
            models.Index(fields=["user", "started_at"]),
            models.Index(fields=["user", "ended_at"]),
            models.Index(fields=["book", "started_at"]),
            models.Index(fields=["started_at"]),
        ]

    def __str__(self):
        return f"user={self.user_id} book={self.book_id} started={self.started_at:%Y-%m-%d %H:%M}"

    def register_heartbeat(self, now):
        """
        Credit the gap since the previous heartbeat.

        Returns (session, counted) where `counted` is False when the session
        had already expired or been closed.
        """
        if self.ended_at is not None:
            return self, False
        gap = (now - self.last_heartbeat_at).total_seconds()
        if gap > self.HEARTBEAT_GAP_MAX:
            # Stale: close without crediting the silent gap.
            self.ended_at = self.last_heartbeat_at
            self.save(update_fields=["ended_at"])
            return self, False
        credit = min(int(gap), self.HEARTBEAT_CREDIT_MAX)
        self.accumulated_seconds = min(self.accumulated_seconds + credit, self.MAX_SESSION_SECONDS)
        self.last_heartbeat_at = now
        if self.accumulated_seconds >= self.MAX_SESSION_SECONDS:
            self.ended_at = now
        self.save(update_fields=["accumulated_seconds", "last_heartbeat_at", "ended_at"])
        return self, True

    def end(self, now):
        """Close the session; idempotent and timezone-consistent."""
        if self.ended_at is not None:
            return self
        gap = (now - self.last_heartbeat_at).total_seconds()
        if gap <= self.HEARTBEAT_GAP_MAX:
            credit = min(int(gap), self.HEARTBEAT_CREDIT_MAX)
            self.accumulated_seconds = min(self.accumulated_seconds + credit, self.MAX_SESSION_SECONDS)
        self.last_heartbeat_at = now
        self.ended_at = now
        self.save(update_fields=["accumulated_seconds", "last_heartbeat_at", "ended_at"])
        return self
