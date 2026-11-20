from datetime import timedelta

from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.books.models import Book, Download, DownloadEvent
from apps.subscriptions.models import Subscription
from apps.tests.test_downloads import _make_fake_open


class DownloadStatsTestCase(APITestCase):
    """Shared setup: an admin, two regular users and downloadable books."""

    def setUp(self):
        self.admin = User.objects.create_superuser(
            username="admin", password="secure-pass-12345", email="admin@example.com"
        )
        self.user = User.objects.create_user(
            username="reader", password="secure-pass-12345", email="reader@example.com"
        )
        self.other = User.objects.create_user(
            username="other", password="secure-pass-12345", email="other@example.com"
        )
        self.free_book = Book.objects.create(title="Free Book")
        self.free_book.document.name = "books/free.pdf"
        self.free_book.save(update_fields=["document"])
        self.premium_book = Book.objects.create(title="Premium Book", is_premium=True)
        self.premium_book.document.name = "books/premium.pdf"
        self.premium_book.save(update_fields=["document"])

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def download(self, user, book):
        with _make_fake_open():
            self.authenticate(user)
            return self.client.post(f"/api/books/{book.id}/download/")

    def subscribe(self, user):
        Subscription.objects.create(
            user=user, plan=Subscription.Plan.PREMIUM, status=Subscription.Status.ACTIVE
        )


class AdminGlobalStatsTests(DownloadStatsTestCase):
    def test_admin_can_access_overview(self):
        resp = self.client.get("/api/admin/download-stats/overview/")
        self.assertIn(resp.status_code, (401, 403))
        self.authenticate(self.admin)
        resp = self.client.get("/api/admin/download-stats/overview/")
        self.assertEqual(resp.status_code, 200)
        for key in (
            "total_download_events", "total_downloaded_books", "total_downloading_users",
            "most_downloaded", "least_downloaded", "recent_activity", "downloads_by_day",
        ):
            self.assertIn(key, resp.data)

    def test_normal_user_cannot_access_overview(self):
        self.authenticate(self.user)
        resp = self.client.get("/api/admin/download-stats/overview/")
        self.assertEqual(resp.status_code, 403)

    def test_librarian_and_editor_cannot_access_admin_stats(self):
        librarian = User.objects.create_user(username="lib", password="secure-pass-12345", role="librarian")
        editor = User.objects.create_user(username="ed", password="secure-pass-12345", role="editor")
        for staff in (librarian, editor):
            self.authenticate(staff)
            resp = self.client.get("/api/admin/download-stats/overview/")
            self.assertEqual(resp.status_code, 403)

    def test_totals_are_accurate(self):
        self.subscribe(self.user)
        self.download(self.user, self.free_book)
        self.download(self.user, self.free_book)
        self.download(self.user, self.premium_book)
        self.download(self.other, self.free_book)
        self.authenticate(self.admin)
        resp = self.client.get("/api/admin/download-stats/overview/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total_download_events"], 4)
        self.assertEqual(resp.data["total_downloaded_books"], 2)
        self.assertEqual(resp.data["total_downloading_users"], 2)
        days = resp.data["downloads_by_day"]
        self.assertEqual(len(days), 30)
        self.assertEqual(sum(day["count"] for day in days), 4)

    def test_recent_activity_lists_latest_events_first(self):
        self.download(self.user, self.free_book)
        self.download(self.other, self.free_book)
        self.authenticate(self.admin)
        resp = self.client.get("/api/admin/download-stats/overview/")
        self.assertEqual(resp.status_code, 200)
        activity = resp.data["recent_activity"]
        self.assertEqual(len(activity), 2)
        self.assertEqual(activity[0]["username"], "other")
        self.assertEqual(activity[1]["username"], "reader")


class AdminBookStatsTests(DownloadStatsTestCase):
    def test_book_stats_counts_and_ranking(self):
        self.subscribe(self.user)
        self.download(self.user, self.free_book)   # 2 events for free book
        self.download(self.user, self.free_book)
        self.download(self.other, self.free_book)
        self.download(self.user, self.premium_book)  # 1 event for premium book
        self.authenticate(self.admin)
        resp = self.client.get("/api/admin/download-stats/books/")
        self.assertEqual(resp.status_code, 200)
        rows = {row["title"]: row for row in resp.data["results"]}
        self.assertEqual(rows["Free Book"]["downloads"], 3)
        self.assertEqual(rows["Free Book"]["unique_users"], 2)
        self.assertEqual(rows["Premium Book"]["downloads"], 1)
        self.assertEqual(rows["Premium Book"]["unique_users"], 1)
        self.assertEqual(rows["Free Book"]["rank"], 1)
        self.assertEqual(rows["Premium Book"]["rank"], 2)
        self.assertIsNotNone(rows["Free Book"]["last_download_at"])

    def test_normal_user_cannot_access_book_stats(self):
        self.authenticate(self.user)
        self.assertEqual(self.client.get("/api/admin/download-stats/books/").status_code, 403)

    def test_book_stats_include_category_and_authors(self):
        from apps.authors.models import Author
        from apps.categories.models import Category

        category = Category.objects.create(name="Stats Category", slug="stats-category")
        author = Author.objects.create(name="Stats Writer")
        self.free_book.category = category
        self.free_book.save(update_fields=["category"])
        self.free_book.authors.add(author)
        self.download(self.user, self.free_book)
        self.authenticate(self.admin)
        resp = self.client.get("/api/admin/download-stats/books/?search=Free")
        self.assertEqual(resp.status_code, 200)
        row = next(r for r in resp.data["results"] if r["title"] == "Free Book")
        self.assertEqual(row["category_name"], "Stats Category")
        self.assertEqual(row["authors"], ["Stats Writer"])

    def test_search_by_book_title(self):
        self.download(self.user, self.free_book)
        self.authenticate(self.admin)
        resp = self.client.get("/api/admin/download-stats/books/?search=Free")
        self.assertEqual(resp.status_code, 200)
        titles = [row["title"] for row in resp.data["results"]]
        self.assertIn("Free Book", titles)
        self.assertNotIn("Premium Book", titles)

    def test_ordering_by_downloads_asc(self):
        self.subscribe(self.user)
        self.download(self.user, self.free_book)
        self.download(self.user, self.premium_book)
        self.download(self.user, self.premium_book)
        self.authenticate(self.admin)
        resp = self.client.get("/api/admin/download-stats/books/?ordering=downloads")
        self.assertEqual(resp.status_code, 200)
        downloads = [row["downloads"] for row in resp.data["results"]]
        self.assertEqual(downloads, sorted(downloads))

    def test_invalid_ordering_is_rejected(self):
        self.authenticate(self.admin)
        resp = self.client.get("/api/admin/download-stats/books/?ordering=hack")
        self.assertEqual(resp.status_code, 400)

    def test_too_long_search_is_rejected(self):
        self.authenticate(self.admin)
        resp = self.client.get(f"/api/admin/download-stats/books/?search={'a' * 201}")
        self.assertEqual(resp.status_code, 400)

    def test_pagination(self):
        self.authenticate(self.admin)
        resp = self.client.get("/api/admin/download-stats/books/?page_size=1&page=1")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertIn("count", resp.data)


class AdminUserStatsTests(DownloadStatsTestCase):
    def test_user_stats_aggregation(self):
        self.subscribe(self.user)
        self.download(self.user, self.free_book)
        self.download(self.user, self.free_book)
        self.download(self.user, self.premium_book)
        self.authenticate(self.admin)
        resp = self.client.get("/api/admin/download-stats/users/")
        self.assertEqual(resp.status_code, 200)
        rows = {row["username"]: row for row in resp.data["results"]}
        self.assertEqual(rows["reader"]["total_events"], 3)
        self.assertEqual(rows["reader"]["unique_books"], 2)
        self.assertEqual(rows["reader"]["most_recent_book"], "Premium Book")
        self.assertIn("reader", rows)
        self.assertNotIn("other", rows)  # no downloads yet

    def test_normal_user_cannot_access_user_stats(self):
        self.authenticate(self.user)
        self.assertEqual(self.client.get("/api/admin/download-stats/users/").status_code, 403)

    def test_search_by_username_email_and_book_title(self):
        self.subscribe(self.user)
        self.download(self.user, self.premium_book)
        self.authenticate(self.admin)
        for query, expected in (("reader@example.com", True), ("read", True), ("Premium Book", True), ("no-match-xyz", False)):
            resp = self.client.get(f"/api/admin/download-stats/users/?search={query}")
            self.assertEqual(resp.status_code, 200)
            found = any(row["username"] == "reader" for row in resp.data["results"])
            self.assertEqual(found, expected, query)

    def test_invalid_ordering_is_rejected(self):
        self.authenticate(self.admin)
        resp = self.client.get("/api/admin/download-stats/users/?ordering=password")
        self.assertEqual(resp.status_code, 400)

    def test_pagination(self):
        self.subscribe(self.other)
        self.download(self.other, self.free_book)
        self.download(self.user, self.free_book)
        self.authenticate(self.admin)
        resp = self.client.get("/api/admin/download-stats/users/?page_size=1&page=2")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["count"], 2)


class AdminUserHistoryTests(DownloadStatsTestCase):
    def test_history_shows_event_level_counts(self):
        self.subscribe(self.user)
        self.download(self.user, self.free_book)
        self.download(self.user, self.free_book)
        self.download(self.user, self.premium_book)
        self.authenticate(self.admin)
        resp = self.client.get(f"/api/admin/download-stats/users/{self.user.id}/history/")
        self.assertEqual(resp.status_code, 200)
        rows = {row["book_title"]: row for row in resp.data["results"]}
        self.assertEqual(rows["Free Book"]["times_downloaded"], 2)
        self.assertEqual(rows["Premium Book"]["times_downloaded"], 1)
        self.assertTrue(rows["Premium Book"]["is_premium"])

    def test_history_pagination_and_search(self):
        self.download(self.user, self.free_book)
        self.authenticate(self.admin)
        resp = self.client.get(f"/api/admin/download-stats/users/{self.user.id}/history/?search=Free")
        self.assertEqual(resp.data["count"], 1)
        resp = self.client.get(f"/api/admin/download-stats/users/{self.user.id}/history/?search=Nope")
        self.assertEqual(resp.data["count"], 0)
        resp = self.client.get(f"/api/admin/download-stats/users/{self.user.id}/history/?page_size=1")
        self.assertEqual(len(resp.data["results"]), 1)

    def test_history_for_unknown_user_is_404(self):
        self.authenticate(self.admin)
        resp = self.client.get("/api/admin/download-stats/users/999999/history/")
        self.assertEqual(resp.status_code, 404)

    def test_normal_user_cannot_access_other_users_history(self):
        self.authenticate(self.user)
        resp = self.client.get(f"/api/admin/download-stats/users/{self.other.id}/history/")
        self.assertEqual(resp.status_code, 403)

    def test_admin_sees_only_requested_users_history(self):
        self.download(self.user, self.free_book)
        self.download(self.other, self.free_book)
        self.authenticate(self.admin)
        resp = self.client.get(f"/api/admin/download-stats/users/{self.user.id}/history/")
        self.assertEqual(resp.data["count"], 1)


class MyDownloadStatsTests(DownloadStatsTestCase):
    def test_unauthenticated_gets_401(self):
        resp = self.client.get("/api/me/download-stats/")
        self.assertIn(resp.status_code, (401, 403))

    def test_personal_stats_are_scoped_to_the_user(self):
        self.download(self.user, self.free_book)
        self.download(self.user, self.free_book)
        self.download(self.other, self.free_book)
        self.authenticate(self.user)
        resp = self.client.get("/api/me/download-stats/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["total_events"], 2)
        self.assertEqual(resp.data["unique_books"], 1)
        self.assertEqual(len(resp.data["downloads_by_day"]), 30)

    def test_repeat_downloads_counted_in_downloads_list(self):
        self.download(self.user, self.free_book)
        self.download(self.user, self.free_book)
        self.authenticate(self.user)
        resp = self.client.get("/api/downloads/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 1)  # one history row
        self.assertEqual(resp.data["results"][0]["times_downloaded"], 2)


class DownloadEventAccountingTests(DownloadStatsTestCase):
    def test_repeated_downloads_create_events_and_increment_counter(self):
        self.download(self.user, self.free_book)
        self.download(self.user, self.free_book)
        self.free_book.refresh_from_db()
        self.assertEqual(self.free_book.download_count, 2)
        self.assertEqual(Download.objects.filter(user=self.user, book=self.free_book).count(), 1)
        self.assertEqual(DownloadEvent.objects.filter(user=self.user, book=self.free_book).count(), 2)

    def test_preview_request_does_not_create_events(self):
        with _make_fake_open():
            self.authenticate(self.user)
            resp = self.client.get(f"/api/books/{self.free_book.id}/document/")
            self.assertEqual(resp.status_code, 200)
        self.assertEqual(DownloadEvent.objects.count(), 0)
        self.free_book.refresh_from_db()
        self.assertEqual(self.free_book.download_count, 0)

    def test_blocked_premium_download_creates_no_events(self):
        resp = self.download(self.user, self.premium_book)
        self.assertEqual(resp.status_code, 403)
        self.assertEqual(DownloadEvent.objects.count(), 0)
        self.assertEqual(Download.objects.count(), 0)
        self.premium_book.refresh_from_db()
        self.assertEqual(self.premium_book.download_count, 0)

    def test_unique_user_counting_across_books(self):
        self.subscribe(self.user)
        self.subscribe(self.other)
        self.download(self.user, self.free_book)
        self.download(self.other, self.free_book)
        self.download(self.user, self.premium_book)
        self.authenticate(self.admin)
        resp = self.client.get("/api/admin/download-stats/overview/")
        rows = {row["title"]: row for row in resp.data["most_downloaded"]}
        self.assertEqual(rows["Free Book"]["unique_users"], 2)
        self.assertEqual(rows["Free Book"]["downloads"], 2)
        self.assertEqual(rows["Premium Book"]["unique_users"], 1)
