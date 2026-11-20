"""Tests for the personal reading-activity endpoint (/api/reading/stats/).

Everything is owner-scoped: the endpoint derives the user from the request
 and never accepts a user_id. Downloads are irrelevant here — only validated
ReadingSession and ReadingProgress records feed these numbers.
"""
from datetime import timedelta

from django.utils import timezone
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.books.models import Book, DownloadEvent
from apps.categories.models import Category
from apps.reading_progress.models import ReadingProgress, ReadingSession
from apps.tests.test_reading_sessions import make_book, make_session, make_user


def make_progress(user, book, percentage, current_page=1):
    return ReadingProgress.objects.create(user=user, book=book, percentage=percentage, current_page=current_page)


class MyReadingStatsApiTests(APITestCase):
    def setUp(self):
        self.user = make_user("reader")
        self.other = make_user("other")
        self.category = Category.objects.create(name="Fiction")
        self.book = make_book("Fictional", category=self.category)
        self.second = make_book("Misc")

    def auth(self):
        self.client.force_authenticate(user=self.user)

    def session(self, user, book, days_ago, seconds, hour=12):
        base = timezone.now() - timedelta(days=days_ago)
        stamp = base.replace(hour=hour, minute=0, second=0, microsecond=0)
        return make_session(user, book, started_at=stamp, last_heartbeat_at=stamp, accumulated=seconds)

    def test_requires_authentication(self):
        self.client.force_authenticate(user=None)
        self.assertIn(self.client.get("/api/reading/stats/").status_code, (401, 403))

    def test_rejects_invalid_period(self):
        self.auth()
        self.assertEqual(self.client.get("/api/reading/stats/?period=bogus").status_code, 400)

    def test_empty_state(self):
        self.auth()
        resp = self.client.get("/api/reading/stats/?period=30d")
        self.assertEqual(resp.status_code, 200)
        totals, lifetime = resp.data["totals"], resp.data["lifetime"]
        self.assertEqual(totals["sessions"], 0)
        self.assertEqual(totals["read_seconds"], 0)
        self.assertEqual(lifetime["books_read"], 0)
        self.assertEqual(lifetime["books_in_progress"], 0)
        self.assertEqual(len(resp.data["series"]), 30)
        self.assertTrue(all(point["read_seconds"] == 0 for point in resp.data["series"]))
        self.assertEqual(resp.data["most_read"], [])
        self.assertEqual(resp.data["recent"], [])
        self.assertIsNone(resp.data["insights"]["trend"])

    def test_series_lengths_zero_filled(self):
        self.auth()
        for period, minimum in (("7d", 7), ("30d", 30), ("6m", 6)):
            resp = self.client.get(f"/api/reading/stats/?period={period}")
            self.assertEqual(resp.status_code, 200)
            self.assertGreaterEqual(len(resp.data["series"]), minimum)
            self.assertTrue(all(set(point) == {"bucket", "sessions", "read_seconds"} for point in resp.data["series"]))

    def test_window_aggregation_excludes_other_users_and_out_of_window(self):
        self.session(self.user, self.book, days_ago=2, seconds=120)
        self.session(self.user, self.book, days_ago=1, seconds=60)   # 7d window
        self.session(self.user, self.book, days_ago=40, seconds=999)  # outside 30d window
        self.session(self.other, self.book, days_ago=1, seconds=888)  # not mine
        self.auth()
        resp = self.client.get("/api/reading/stats/?period=7d")
        self.assertEqual(resp.data["totals"]["sessions"], 2)
        self.assertEqual(resp.data["totals"]["read_seconds"], 180)
        self.assertEqual(resp.data["totals"]["books_opened"], 1)
        self.assertEqual(resp.data["totals"]["days_active"], 2)
        resp = self.client.get("/api/reading/stats/?period=30d")
        self.assertEqual(resp.data["totals"]["read_seconds"], 180)
        resp = self.client.get("/api/reading/stats/?period=6m")
        self.assertEqual(resp.data["totals"]["read_seconds"], 1179)
        self.assertEqual(resp.data["granularity"], "month")

    def test_downloads_do_not_count_as_reading(self):
        DownloadEvent.objects.create(user=self.user, book=self.book)
        self.auth()
        resp = self.client.get("/api/reading/stats/?period=7d")
        self.assertEqual(resp.data["totals"]["sessions"], 0)
        self.assertEqual(resp.data["totals"]["read_seconds"], 0)

    def test_lifetime_completion_criteria(self):
        make_progress(self.user, self.book, 100)
        make_progress(self.user, self.second, 37.5, current_page=37)
        self.session(self.user, self.book, days_ago=1, seconds=10)
        self.auth()
        resp = self.client.get("/api/reading/stats/?period=7d")
        self.assertEqual(resp.data["lifetime"]["books_read"], 1)
        self.assertEqual(resp.data["lifetime"]["books_in_progress"], 1)
        self.assertEqual(resp.data["lifetime"]["sessions"], 1)
        self.assertEqual(resp.data["lifetime"]["read_seconds"], 10)

    def test_most_read_and_recent_payloads(self):
        self.session(self.user, self.book, days_ago=1, seconds=300)
        self.session(self.user, self.book, days_ago=2, seconds=100)
        self.session(self.user, self.second, days_ago=3, seconds=50)
        make_progress(self.user, self.book, 42, current_page=42)
        self.auth()
        resp = self.client.get("/api/reading/stats/?period=30d")
        most_read = resp.data["most_read"]
        self.assertEqual([row["title"] for row in most_read][:2], ["Fictional", "Misc"])
        self.assertEqual(most_read[0]["read_seconds"], 400)
        self.assertEqual(most_read[0]["sessions"], 2)
        self.assertEqual(most_read[0]["progress_percentage"], 42.0)
        self.assertEqual(most_read[0]["authors"], [])
        self.assertEqual(len(resp.data["recent"]), 3)
        recent_titles = [row["book_title"] for row in resp.data["recent"]]
        self.assertIn("Fictional", recent_titles)

    def test_insights_and_trend_up(self):
        # Previous window (8-13 days ago): light reading. Current: heavy.
        self.session(self.user, self.book, days_ago=10, seconds=100)
        self.session(self.user, self.book, days_ago=1, seconds=900)
        self.session(self.user, self.second, days_ago=2, seconds=500, hour=15)
        self.auth()
        resp = self.client.get("/api/reading/stats/?period=7d")
        insights = resp.data["insights"]
        self.assertEqual(insights["favorite_category"], "Fiction")
        self.assertEqual(insights["trend"], "up")
        self.assertGreater(resp.data["totals"]["engagement_trend_pct"], 0)
        self.assertEqual(insights["total_sessions"], 3)
        self.assertIn(insights["most_active_weekday"], range(1, 8))
        self.assertIsNotNone(insights["consistency_pct"])

    def test_user_isolation(self):
        self.session(self.other, self.book, days_ago=1, seconds=500)
        self.session(self.user, self.book, days_ago=1, seconds=10)
        self.auth()
        resp = self.client.get("/api/reading/stats/?period=30d")
        self.assertEqual(resp.data["totals"]["read_seconds"], 10)
        self.assertEqual(resp.data["totals"]["sessions"], 1)
        for row in resp.data["recent"]:
            self.assertNotEqual(row["duration_seconds"], 500)
