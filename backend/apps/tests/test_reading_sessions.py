"""Tests for reading-session tracking and reading-engagement analytics.

The server is the only source of time accounting: durations are credited
from heartbeat gaps only, stale sessions close without crediting the gap,
and downloads never create sessions.
"""
from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.books.models import Book
from apps.categories.models import Category
from apps.reading_progress.models import ReadingSession


def make_user(username, role=User.Role.USER):
    return User.objects.create_user(username=username, password="secure-pass-12345", role=role)


def make_book(title, category=None, is_premium=False):
    return Book.objects.create(title=title, category=category, is_premium=is_premium)


def make_session(user, book, started_at=None, last_heartbeat_at=None, accumulated=0):
    now = timezone.now()
    return ReadingSession.objects.create(
        user=user,
        book=book,
        started_at=started_at or now,
        last_heartbeat_at=last_heartbeat_at or started_at or now,
        accumulated_seconds=accumulated,
    )


class ReadingSessionModelTests(APITestCase):
    def setUp(self):
        self.user = make_user("reader")
        self.book = make_book("A Book")

    def test_heartbeat_credits_gap_up_to_credit_cap(self):
        now = timezone.now()
        session = make_session(self.user, self.book, last_heartbeat_at=now - timedelta(seconds=30))
        session, counted = session.register_heartbeat(now)
        self.assertTrue(counted)
        self.assertEqual(session.accumulated_seconds, 30)

    def test_heartbeat_credits_at_most_credit_cap(self):
        now = timezone.now()
        session = make_session(self.user, self.book, last_heartbeat_at=now - timedelta(seconds=80))
        session, counted = session.register_heartbeat(now)
        self.assertTrue(counted)
        self.assertEqual(session.accumulated_seconds, ReadingSession.HEARTBEAT_CREDIT_MAX)

    def test_heartbeat_gap_beyond_limit_closes_without_credit(self):
        now = timezone.now()
        stale_at = now - timedelta(seconds=ReadingSession.HEARTBEAT_GAP_MAX + 10)
        session = make_session(self.user, self.book, last_heartbeat_at=stale_at, accumulated=120)
        session, counted = session.register_heartbeat(now)
        self.assertFalse(counted)
        self.assertEqual(session.accumulated_seconds, 120)
        self.assertEqual(session.ended_at, stale_at)

    def test_heartbeat_on_closed_session_is_a_noop(self):
        now = timezone.now()
        session = make_session(self.user, self.book, accumulated=50)
        session.end(now)
        accumulated = session.accumulated_seconds
        session, counted = session.register_heartbeat(now + timedelta(seconds=10))
        self.assertFalse(counted)
        self.assertEqual(session.accumulated_seconds, accumulated)

    def test_heartbeat_respects_max_session_cap(self):
        now = timezone.now()
        session = make_session(
            self.user, self.book,
            last_heartbeat_at=now - timedelta(seconds=30),
            accumulated=ReadingSession.MAX_SESSION_SECONDS - 10,
        )
        session, counted = session.register_heartbeat(now)
        self.assertTrue(counted)
        self.assertEqual(session.accumulated_seconds, ReadingSession.MAX_SESSION_SECONDS)
        self.assertIsNotNone(session.ended_at)

    def test_end_credits_small_gap_and_is_idempotent(self):
        now = timezone.now()
        session = make_session(self.user, self.book, last_heartbeat_at=now - timedelta(seconds=30), accumulated=10)
        session.end(now)
        self.assertEqual(session.accumulated_seconds, 40)
        first_end = session.ended_at
        session.end(now + timedelta(seconds=5))
        self.assertEqual(session.accumulated_seconds, 40)
        self.assertEqual(session.ended_at, first_end)

    def test_end_with_large_gap_does_not_credit(self):
        now = timezone.now()
        stale_at = now - timedelta(seconds=500)
        session = make_session(self.user, self.book, last_heartbeat_at=stale_at, accumulated=75)
        session.end(now)
        self.assertEqual(session.accumulated_seconds, 75)
        self.assertEqual(session.ended_at, now)


class ReadingSessionApiTests(APITestCase):
    def setUp(self):
        self.user = make_user("reader")
        self.other = make_user("other")
        self.book = make_book("A Book")

    def start(self, user):
        self.client.force_authenticate(user=user)
        return self.client.post("/api/reading/sessions/", {"book": self.book.id}, format="json")

    def test_start_creates_session(self):
        resp = self.start(self.user)
        self.assertEqual(resp.status_code, 201)
        self.assertEqual(resp.data["book"], self.book.id)
        self.assertEqual(resp.data["accumulated_seconds"], 0)
        self.assertTrue(resp.data["active"])

    def test_start_reuses_open_session_within_reopen_window(self):
        first = self.start(self.user)
        second = self.start(self.user)
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.data["id"], first.data["id"])
        self.assertEqual(ReadingSession.objects.count(), 1)

    def test_start_closes_stale_session_and_creates_new(self):
        now = timezone.now()
        stale = make_session(
            self.user, self.book,
            started_at=now - timedelta(hours=2),
            last_heartbeat_at=now - timedelta(seconds=ReadingSession.HEARTBEAT_GAP_MAX + 20),
            accumulated=90,
        )
        resp = self.start(self.user)
        self.assertEqual(resp.status_code, 201)
        self.assertNotEqual(resp.data["id"], stale.id)
        stale.refresh_from_db()
        self.assertEqual(stale.accumulated_seconds, 90)
        self.assertIsNotNone(stale.ended_at)

    def test_heartbeat_and_end_are_owner_scoped(self):
        session = make_session(self.user, self.book)
        self.client.force_authenticate(user=self.other)
        self.assertEqual(self.client.post(f"/api/reading/sessions/{session.id}/heartbeat/").status_code, 404)
        self.assertEqual(self.client.post(f"/api/reading/sessions/{session.id}/end/").status_code, 404)

    def test_heartbeat_over_api_records_time_and_stale_gap_closes(self):
        now = timezone.now()
        session = make_session(
            self.user, self.book,
            started_at=now - timedelta(minutes=5),
            last_heartbeat_at=now - timedelta(seconds=30),
            accumulated=15,
        )
        self.client.force_authenticate(user=self.user)
        resp = self.client.post(f"/api/reading/sessions/{session.id}/heartbeat/")
        self.assertEqual(resp.status_code, 200)
        self.assertTrue(resp.data["recorded"])
        self.assertEqual(resp.data["accumulated_seconds"], 45)

        stale = make_session(
            self.user, self.book,
            started_at=now - timedelta(hours=1),
            last_heartbeat_at=now - timedelta(seconds=ReadingSession.HEARTBEAT_GAP_MAX + 5),
            accumulated=33,
        )
        resp = self.client.post(f"/api/reading/sessions/{stale.id}/heartbeat/")
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(resp.data["recorded"])
        self.assertEqual(resp.data["accumulated_seconds"], 33)
        stale.refresh_from_db()
        self.assertIsNotNone(stale.ended_at)

    def test_end_endpoint_is_idempotent(self):
        session = make_session(self.user, self.book, accumulated=10)
        self.client.force_authenticate(user=self.user)
        first = self.client.post(f"/api/reading/sessions/{session.id}/end/")
        second = self.client.post(f"/api/reading/sessions/{session.id}/end/")
        self.assertEqual(first.data["accumulated_seconds"], second.data["accumulated_seconds"])
        self.assertFalse(second.data["active"])

    def test_unauthenticated_rejected(self):
        self.client.force_authenticate(user=None)
        self.assertIn(self.client.post("/api/reading/sessions/", {"book": self.book.id}, format="json").status_code, (401, 403))

    def test_premium_book_denied_without_subscription(self):
        premium = make_book("Premium", is_premium=True)
        self.client.force_authenticate(user=self.user)
        resp = self.client.post("/api/reading/sessions/", {"book": premium.id}, format="json")
        self.assertEqual(resp.status_code, 403)

    def test_invalid_book_id_rejected(self):
        self.client.force_authenticate(user=self.user)
        resp = self.client.post("/api/reading/sessions/", {"book": "nope"}, format="json")
        self.assertEqual(resp.status_code, 400)


class ReadingAnalyticsApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser(username="admin", password="secure-pass-12345", email="admin@example.com")
        self.user = make_user("reader")
        self.other = make_user("other")
        self.librarian = make_user("lib", role=User.Role.LIBRARIAN)
        self.category = Category.objects.create(name="Fiction")
        self.book = make_book("Fictional", category=self.category)
        self.uncategorized = make_book("Misc")

    def session_in_window(self, user, book, days_ago, seconds, hour=12):
        base = timezone.now() - timedelta(days=days_ago)
        stamp = base.replace(hour=hour, minute=0, second=0, microsecond=0)
        return make_session(user, book, started_at=stamp, last_heartbeat_at=stamp, accumulated=seconds)

    def test_overview_requires_admin(self):
        for user in (self.user, self.librarian):
            self.client.force_authenticate(user=user)
            self.assertEqual(self.client.get("/api/admin/analytics/overview/?period=7d").status_code, 403)
        self.client.force_authenticate(user=None)
        self.assertIn(self.client.get("/api/admin/analytics/overview/?period=7d").status_code, (401, 403))

    def test_overview_rejects_invalid_period(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/analytics/overview/?period=999x")
        self.assertEqual(resp.status_code, 400)

    def test_overview_empty_state_is_zeroed(self):
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/analytics/overview/?period=7d")
        self.assertEqual(resp.status_code, 200)
        totals = resp.data["totals"]
        self.assertEqual(totals["sessions"], 0)
        self.assertEqual(totals["active_readers"], 0)
        self.assertEqual(totals["read_seconds"], 0)
        self.assertEqual(resp.data["top_readers"], [])
        self.assertEqual(resp.data["top_categories"], [])
        self.assertEqual(resp.data["insights"]["peak_period"], None)
        self.assertEqual(len(resp.data["series"]), 7)  # zero-filled day buckets
        self.assertTrue(all(point["sessions"] == 0 for point in resp.data["series"]))

    def test_overview_aggregates_sessions(self):
        self.session_in_window(self.user, self.book, days_ago=1, seconds=120)
        self.session_in_window(self.user, self.book, days_ago=2, seconds=60)
        self.session_in_window(self.other, self.uncategorized, days_ago=2, seconds=30)
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/analytics/overview/?period=30d")
        self.assertEqual(resp.status_code, 200)
        totals = resp.data["totals"]
        self.assertEqual(totals["sessions"], 3)
        self.assertEqual(totals["active_readers"], 2)
        self.assertEqual(totals["read_seconds"], 210)
        self.assertEqual(totals["books_opened"], 2)
        self.assertEqual(len(resp.data["series"]), 30)

        readers = {row["username"]: row for row in resp.data["top_readers"]}
        self.assertEqual(readers["reader"]["sessions"], 2)
        self.assertEqual(readers["reader"]["days_active"], 2)
        self.assertEqual(readers["reader"]["read_seconds"], 180)
        self.assertEqual(readers["reader"]["engagement"], "high")

        # 2 of 3 sessions are the Fiction book; the uncategorized row carries a null category.
        fiction = next(row for row in resp.data["top_categories"] if row["category"] == "Fiction")
        self.assertAlmostEqual(fiction["percent"], round(2 / 3 * 100, 1))

    def test_overview_new_returning_and_declining_readers(self):
        # reader: brand-new activity inside the window.
        self.session_in_window(self.user, self.book, days_ago=1, seconds=100)
        # other: activity before the window plus in-window, and much quieter than the previous window.
        self.session_in_window(self.other, self.book, days_ago=45, seconds=100)
        self.session_in_window(self.other, self.book, days_ago=40, seconds=100)
        self.session_in_window(self.other, self.book, days_ago=35, seconds=100)
        self.session_in_window(self.other, self.book, days_ago=1, seconds=100)

        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/analytics/overview/?period=30d")
        totals = resp.data["totals"]
        self.assertEqual(totals["new_readers"], 1)      # reader
        self.assertEqual(totals["returning_readers"], 1)  # other
        self.assertEqual(totals["declining_readers"], 1)  # 1 session vs 3 previously

    def test_overview_insights_peak_period(self):
        self.session_in_window(self.user, self.book, days_ago=1, seconds=10, hour=14)
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/analytics/overview/?period=7d")
        self.assertEqual(resp.data["insights"]["peak_period"], "afternoon")
        self.assertIn(resp.data["insights"]["most_active_weekday"], range(1, 8))
        self.assertEqual(resp.data["insights"]["most_popular_category"], "Fiction")

    def test_overview_trend_up_when_current_window_beats_previous(self):
        # previous window (31-59 days ago) barely read; current window read heavily.
        self.session_in_window(self.user, self.book, days_ago=45, seconds=100)
        self.session_in_window(self.other, self.book, days_ago=1, seconds=500)
        self.session_in_window(self.user, self.book, days_ago=2, seconds=500)
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/analytics/overview/?period=30d")
        self.assertEqual(resp.data["insights"]["overall_trend"], "up")
        self.assertGreater(resp.data["totals"]["engagement_trend_pct"], 0)

    def test_user_detail_endpoint(self):
        self.session_in_window(self.user, self.book, days_ago=1, seconds=120)
        self.session_in_window(self.user, self.uncategorized, days_ago=3, seconds=60)
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get(f"/api/admin/analytics/users/{self.user.id}/?period=30d")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["user"]["username"], "reader")
        self.assertEqual(resp.data["totals"]["sessions"], 2)
        self.assertEqual(resp.data["totals"]["books_opened"], 2)
        self.assertEqual(resp.data["totals"]["read_seconds"], 180)
        self.assertEqual(len(resp.data["series"]), 30)
        self.assertEqual(len(resp.data["recent_sessions"]), 2)

    def test_user_detail_requires_admin_and_valid_user(self):
        self.client.force_authenticate(user=self.user)
        self.assertEqual(self.client.get(f"/api/admin/analytics/users/{self.user.id}/").status_code, 403)
        self.client.force_authenticate(user=self.admin)
        self.assertEqual(self.client.get("/api/admin/analytics/users/999999/").status_code, 404)
        self.assertEqual(self.client.get(f"/api/admin/analytics/users/{self.user.id}/?period=nope").status_code, 400)

    def test_six_month_period_uses_month_buckets(self):
        self.session_in_window(self.user, self.book, days_ago=10, seconds=100)
        self.client.force_authenticate(user=self.admin)
        resp = self.client.get("/api/admin/analytics/overview/?period=6m")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["granularity"], "month")
        self.assertGreaterEqual(len(resp.data["series"]), 6)
