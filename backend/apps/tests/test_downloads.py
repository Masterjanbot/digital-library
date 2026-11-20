from datetime import timedelta
from unittest.mock import patch

from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.books.access import can_download_book, has_active_premium
from apps.books.models import Book, Download
from apps.subscriptions.models import Subscription


class _FakeFile:
    """Minimal file-like object used for API tests that stream PDFs."""
    def __init__(self, name="test.pdf", raw=b"%PDF-1.4 fake"):
        self.name = name
        self.raw = raw
        self._pos = 0

    def read(self, size=-1):
        if size < 0:
            result = self.raw[self._pos:]
            self._pos = len(self.raw)
            return result
        end = min(self._pos + size, len(self.raw))
        result = self.raw[self._pos:end]
        self._pos = end
        return result

    def seek(self, pos, whence=0):
        if whence == 0:
            self._pos = pos
        elif whence == 1:
            self._pos += pos
        elif whence == 2:
            self._pos = len(self.raw) + pos
        return self._pos

    def tell(self):
        return self._pos

    def close(self):
        pass

    def flush(self):
        pass


def _make_fake_open():
    """Return a context manager that patches book document.open() for tests."""
    from django.core.files.base import ContentFile
    from django.db.models.fields.files import FieldFile

    original_open = FieldFile.open

    def fake_open(self_file_obj, mode="rb", **kwargs):
        filename = getattr(self_file_obj.storage, "bucket_name", "") if hasattr(getattr(self_file_obj, "storage", None), "bucket_name") else "books/test.pdf"
        return _FakeFile(filename or "books/test.pdf")

    return patch.object(FieldFile, "open", fake_open)


class DownloadAccessTests(APITestCase):
    """Unit tests for access-control helpers."""

    def setUp(self):
        self.reader = User.objects.create_user(
            username="reader", password="secure-pass-12345"
        )
        self.staff = User.objects.create_superuser(
            username="admin", password="secure-pass-12345", email="admin@example.com"
        )
        self.free_book = Book.objects.create(title="Free Book")
        self.free_book.document.name = "books/free.pdf"
        self.free_book.save(update_fields=["document"])
        self.premium_book = Book.objects.create(title="Premium Book", is_premium=True)
        self.premium_book.document.name = "books/premium.pdf"
        self.premium_book.save(update_fields=["document"])
        self.private_book = Book.objects.create(
            title="Private Book", visibility=Book.Visibility.PRIVATE
        )
        self.private_book.document.name = "books/private.pdf"
        self.private_book.save(update_fields=["document"])

    def test_unauthenticated_user_cannot_access_any_book_document(self):
        self.assertFalse(can_download_book(self.free_book, None))
        self.assertFalse(can_download_book(self.premium_book, None))

    def test_authenticated_user_can_access_free_published_book(self):
        self.assertTrue(can_download_book(self.free_book, self.reader))

    def test_unauthenticated_user_blocked_from_private_books(self):
        self.assertFalse(can_download_book(self.private_book, None))

    def test_premium_book_rejected_without_subscription(self):
        self.assertFalse(can_download_book(self.premium_book, self.reader))

    def test_premium_book_accepted_with_active_subscription(self):
        Subscription.objects.create(
            user=self.reader, plan=Subscription.Plan.PREMIUM, status=Subscription.Status.ACTIVE
        )
        self.assertTrue(has_active_premium(self.reader))
        self.assertTrue(can_download_book(self.premium_book, self.reader))

    def test_staff_always_has_premium_access(self):
        self.assertTrue(has_active_premium(self.staff))
        self.assertTrue(can_download_book(self.premium_book, self.staff))

    def test_expired_subscription_denies_access(self):
        Subscription.objects.create(
            user=self.reader,
            plan=Subscription.Plan.PREMIUM,
            status=Subscription.Status.ACTIVE,
            expires_at=self.reader.date_joined - timedelta(days=1),
        )
        self.assertFalse(has_active_premium(self.reader))
        self.assertFalse(can_download_book(self.premium_book, self.reader))

    def test_cancelled_subscription_denies_access(self):
        Subscription.objects.create(
            user=self.reader, plan=Subscription.Plan.PREMIUM, status=Subscription.Status.CANCELLED
        )
        self.assertFalse(has_active_premium(self.reader))
        self.assertFalse(can_download_book(self.premium_book, self.reader))

    def test_drafted_book_not_available_for_download(self):
        draft = Book.objects.create(title="Draft Book", status=Book.Status.DRAFT)
        draft.document.name = "books/draft.pdf"
        draft.save(update_fields=["document"])
        self.assertFalse(can_download_book(draft, self.reader))

    def test_no_document_means_not_downloadable(self):
        book = Book.objects.create(title="No PDF")
        self.assertFalse(can_download_book(book, self.reader))


class DownloadApiTests(APITestCase):
    """Integration tests for download endpoints (file access patched)."""

    def setUp(self):
        self.user = User.objects.create_user(username="reader", password="secure-pass-12345")
        self.other = User.objects.create_user(username="other", password="secure-pass-12345")
        self.staff = User.objects.create_superuser(
            username="admin", password="secure-pass-12345", email="admin@example.com"
        )
        self.free_book = Book.objects.create(title="Free Book")
        self.free_book.document.name = "books/free.pdf"
        self.free_book.save(update_fields=["document"])
        self.premium_book = Book.objects.create(title="Premium Book", is_premium=True)
        self.premium_book.document.name = "books/premium.pdf"
        self.premium_book.save(update_fields=["document"])
        self.private_book = Book.objects.create(
            title="Private Book", visibility=Book.Visibility.PRIVATE
        )
        self.private_book.document.name = "books/private.pdf"
        self.private_book.save(update_fields=["document"])

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    # ---------- Unauthenticated ----------
    def test_unauthenticated_gets_401_on_document(self):
        resp = self.client.get(f"/api/books/{self.free_book.id}/document/")
        self.assertIn(resp.status_code, (401, 403))

    def test_unauthenticated_gets_401_on_download_action(self):
        resp = self.client.post(f"/api/books/{self.free_book.id}/download/")
        self.assertIn(resp.status_code, (401, 403))

    # ---------- Free-book download ----------
    def test_authenticated_user_can_download_free_book(self):
        with _make_fake_open():
            self.authenticate(self.user)
            resp = self.client.post(f"/api/books/{self.free_book.id}/download/")
            self.assertEqual(resp.status_code, 200)
            self.assertTrue(Download.objects.filter(user=self.user, book=self.free_book).exists())

    def test_download_increments_download_count(self):
        with _make_fake_open():
            self.authenticate(self.user)
            initial = self.free_book.download_count
            self.client.post(f"/api/books/{self.free_book.id}/download/")
            self.free_book.refresh_from_db()
            self.assertEqual(self.free_book.download_count, initial + 1)

    # ---------- Premium-book without subscription ----------
    def test_unsubscribed_user_rejected_for_premium_download(self):
        with _make_fake_open():
            self.authenticate(self.user)
            resp = self.client.post(f"/api/books/{self.premium_book.id}/download/")
            self.assertEqual(resp.status_code, 403)
            self.assertFalse(Download.objects.filter(user=self.user, book=self.premium_book).exists())

    # ---------- Premium-book with active subscription ----------
    def test_subscribed_user_can_download_premium_book(self):
        Subscription.objects.create(
            user=self.user, plan=Subscription.Plan.PREMIUM, status=Subscription.Status.ACTIVE
        )
        with _make_fake_open():
            self.authenticate(self.user)
            resp = self.client.post(f"/api/books/{self.premium_book.id}/download/")
            self.assertEqual(resp.status_code, 200)
            self.assertTrue(Download.objects.filter(user=self.user, book=self.premium_book).exists())

    # ---------- Expired subscription ----------
    def test_expired_subscription_rejects_premium_download(self):
        Subscription.objects.create(
            user=self.user,
            plan=Subscription.Plan.PREMIUM,
            status=Subscription.Status.ACTIVE,
            expires_at=self.user.date_joined - timedelta(days=1),
        )
        with _make_fake_open():
            self.authenticate(self.user)
            resp = self.client.post(f"/api/books/{self.premium_book.id}/download/")
            self.assertEqual(resp.status_code, 403)

    # ---------- Cancelled subscription ----------
    def test_cancelled_subscription_rejects_premium_download(self):
        Subscription.objects.create(
            user=self.user, plan=Subscription.Plan.PREMIUM, status=Subscription.Status.CANCELLED
        )
        with _make_fake_open():
            self.authenticate(self.user)
            resp = self.client.post(f"/api/books/{self.premium_book.id}/download/")
            self.assertEqual(resp.status_code, 403)

    # ---------- Staff bypasses premium restriction ----------
    def test_staff_can_download_premium_without_subscription(self):
        with _make_fake_open():
            self.authenticate(self.staff)
            resp = self.client.post(f"/api/books/{self.premium_book.id}/download/")
            self.assertEqual(resp.status_code, 200)

    # ---------- Private book ----------
    def test_other_user_cannot_download_private_book(self):
        with _make_fake_open():
            self.authenticate(self.other)
            resp = self.client.post(f"/api/books/{self.private_book.id}/download/")
            self.assertEqual(resp.status_code, 404)

    # ---------- Upgrade route ----------
    def test_upgrade_route_grants_download(self):
        with _make_fake_open():
            self.authenticate(self.user)
            denied = self.client.post(f"/api/books/{self.premium_book.id}/download/")
            self.assertEqual(denied.status_code, 403)
            Subscription.objects.create(
                user=self.user, plan=Subscription.Plan.PREMIUM, status=Subscription.Status.ACTIVE
            )
            granted = self.client.post(f"/api/books/{self.premium_book.id}/download/")
            self.assertEqual(granted.status_code, 200)

    # ---------- Duplicate downloads ----------
    def test_duplicate_download_records_only_one_history_entry(self):
        with _make_fake_open():
            self.authenticate(self.user)
            self.client.post(f"/api/books/{self.free_book.id}/download/")
            self.client.post(f"/api/books/{self.free_book.id}/download/")
            self.assertEqual(Download.objects.filter(user=self.user, book=self.free_book).count(), 1)

    # ---------- Document (GET) endpoint still works for free books ----------
    def test_document_get_still_works_for_free_book(self):
        with _make_fake_open():
            self.authenticate(self.user)
            resp = self.client.get(f"/api/books/{self.free_book.id}/document/")
            self.assertEqual(resp.status_code, 200)

    # ---------- Document (GET) endpoint blocked for premium ----------
    def test_document_get_blocked_for_premium_without_subscription(self):
        with _make_fake_open():
            self.authenticate(self.user)
            resp = self.client.get(f"/api/books/{self.premium_book.id}/document/")
            self.assertEqual(resp.status_code, 403)

    # ---------- Direct download URL not accessible ----------
    def test_unauthorized_direct_url_is_rejected(self):
        """Users cannot guess direct file URLs on their own."""
        resp = self.client.get("/api/books/nonexistent-file.pdf")
        self.assertNotEqual(resp.status_code, 200)


class MyDownloadsListTests(APITestCase):
    """Tests for the downloads listing endpoint."""

    def setUp(self):
        self.user = User.objects.create_user(username="reader", password="secure-pass-12345")
        self.other = User.objects.create_user(username="other", password="secure-pass-12345")
        self.book1 = Book.objects.create(title="First Book")
        self.book1.document.name = "books/b1.pdf"
        self.book1.save(update_fields=["document"])
        self.book2 = Book.objects.create(title="Second Book", is_premium=True)
        self.book2.document.name = "books/b2.pdf"
        self.book2.save(update_fields=["document"])
        self.book3 = Book.objects.create(title="Third Book")
        self.book3.document.name = "books/b3.pdf"
        self.book3.save(update_fields=["document"])

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_unauthenticated_gets_401(self):
        resp = self.client.get("/api/downloads/")
        self.assertIn(resp.status_code, (401, 403))

    def test_empty_downloads_list_when_none_recorded(self):
        self.authenticate(self.user)
        resp = self.client.get("/api/downloads/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 0)

    def test_downloads_recorded_after_successful_download(self):
        with _make_fake_open():
            self.authenticate(self.user)
            self.client.post(f"/api/books/{self.book1.id}/download/")
            Subscription.objects.create(
                user=self.user, plan=Subscription.Plan.PREMIUM, status=Subscription.Status.ACTIVE
            )
            self.client.post(f"/api/books/{self.book2.id}/download/")
        resp = self.client.get("/api/downloads/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 2)

    def test_user_cannot_see_another_users_downloads(self):
        with _make_fake_open():
            self.authenticate(self.user)
            self.client.post(f"/api/books/{self.book1.id}/download/")
            self.authenticate(self.other)
            self.client.post(f"/api/books/{self.book3.id}/download/")
            self.authenticate(self.user)
        resp = self.client.get("/api/downloads/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 1)
        result_ids = {item["book"] for item in resp.data["results"]}
        self.assertNotIn(self.book3.id, result_ids)
        self.assertIn(self.book1.id, result_ids)

    def test_response_includes_expected_fields(self):
        with _make_fake_open():
            self.authenticate(self.user)
            self.client.post(f"/api/books/{self.book1.id}/download/")
        resp = self.client.get("/api/downloads/")
        self.assertEqual(resp.status_code, 200)
        item = resp.data["results"][0]
        self.assertEqual(item["book_title"], "First Book")
        self.assertIsNotNone(item["downloaded_at"])
        self.assertFalse(item["is_premium"])
        self.assertEqual(item["book_type"], "Free")
        # cover_url may be None if the book has no cover image

    def test_premium_book_shows_premium_type(self):
        Subscription.objects.create(
            user=self.user, plan=Subscription.Plan.PREMIUM, status=Subscription.Status.ACTIVE
        )
        with _make_fake_open():
            self.authenticate(self.user)
            self.client.post(f"/api/books/{self.book2.id}/download/")
        resp = self.client.get("/api/downloads/")
        item = resp.data["results"][0]
        self.assertEqual(item["is_premium"], True)
        self.assertEqual(item["book_type"], "Premium")


class BookAuthorRegressionTests(APITestCase):
    """Regression tests for the book_author field in /api/downloads/."""

    def setUp(self):
        from apps.authors.models import Author

        self.user = User.objects.create_user(username="reader", password="secure-pass-12345")
        self.author1 = Author.objects.create(name="Ana Author")
        self.author2 = Author.objects.create(name="Ben Writer")
        self.book = Book.objects.create(title="Authored Book")
        self.book.authors.add(self.author1, self.author2)
        self.book.document.name = "books/authored.pdf"
        self.book.save(update_fields=["document"])

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_downloads_response_includes_book_author_list(self):
        with _make_fake_open():
            self.authenticate(self.user)
            self.client.post(f"/api/books/{self.book.id}/download/")
        resp = self.client.get("/api/downloads/")
        self.assertEqual(resp.status_code, 200)
        item = resp.data["results"][0]
        self.assertIn("book_author", item)
        self.assertIsInstance(item["book_author"], list)
        self.assertEqual(sorted(item["book_author"]), ["Ana Author", "Ben Writer"])

    def test_downloads_response_book_author_empty_list_when_no_authors(self):
        book = Book.objects.create(title="Anonymous Book")
        book.document.name = "books/anon.pdf"
        book.save(update_fields=["document"])
        with _make_fake_open():
            self.authenticate(self.user)
            self.client.post(f"/api/books/{book.id}/download/")
        resp = self.client.get("/api/downloads/")
        item = next(r for r in resp.data["results"] if r["book"] == book.id)
        self.assertEqual(item["book_author"], [])


class DownloadFilterTests(APITestCase):
    """Tests for ?search= and ?is_premium= on /api/downloads/ and user isolation."""

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def setUp(self):
        from apps.authors.models import Author

        self.user = User.objects.create_user(username="reader", password="secure-pass-12345")
        self.other = User.objects.create_user(username="other", password="secure-pass-12345")
        self.author = Author.objects.create(name="Unique Writername")
        self.free_book = Book.objects.create(title="Common Free Title")
        self.free_book.authors.add(self.author)
        self.free_book.document.name = "books/ff.pdf"
        self.free_book.save(update_fields=["document"])
        self.premium_book = Book.objects.create(title="Common Premium Title", is_premium=True)
        self.premium_book.document.name = "books/pp.pdf"
        self.premium_book.save(update_fields=["document"])
        Subscription.objects.create(
            user=self.user, plan=Subscription.Plan.PREMIUM, status=Subscription.Status.ACTIVE
        )
        self.other_book = Book.objects.create(title="Other User Book")
        self.other_book.document.name = "books/oo.pdf"
        self.other_book.save(update_fields=["document"])
        with _make_fake_open():
            self.authenticate(self.user)
            self.client.post(f"/api/books/{self.free_book.id}/download/")
            self.client.post(f"/api/books/{self.premium_book.id}/download/")
            self.authenticate(self.other)
            self.client.post(f"/api/books/{self.other_book.id}/download/")
        self.authenticate(self.user)

    def test_missing_filter_params_return_unfiltered_results(self):
        resp = self.client.get("/api/downloads/")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 2)

    def test_is_premium_true_returns_only_premium(self):
        resp = self.client.get("/api/downloads/?is_premium=true")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["book"], self.premium_book.id)

    def test_is_premium_false_returns_only_free(self):
        resp = self.client.get("/api/downloads/?is_premium=false")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["book"], self.free_book.id)

    def test_search_matches_book_title(self):
        resp = self.client.get("/api/downloads/?search=Common Free")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["book"], self.free_book.id)

    def test_search_matches_author_name(self):
        resp = self.client.get("/api/downloads/?search=Unique Writername")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 1)
        self.assertEqual(resp.data["results"][0]["book"], self.free_book.id)

    def test_filters_are_scoped_to_current_user(self):
        resp = self.client.get("/api/downloads/?search=Other User")
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(resp.data["count"], 0)
        resp = self.client.get("/api/downloads/?is_premium=false")
        self.assertEqual(resp.data["count"], 1)


class ReadVsDownloadSemanticsTests(APITestCase):
    """P1 contract: GET document reads, POST download downloads."""

    def setUp(self):
        self.user = User.objects.create_user(username="reader", password="secure-pass-12345")
        self.free_book = Book.objects.create(title="Free Book")
        self.free_book.document.name = "books/free.pdf"
        self.free_book.save(update_fields=["document"])
        self.premium_book = Book.objects.create(title="Premium Book", is_premium=True)
        self.premium_book.document.name = "books/premium.pdf"
        self.premium_book.save(update_fields=["document"])

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def _count(self, book):
        book.refresh_from_db()
        return book.download_count

    def test_get_document_does_not_increment_download_count(self):
        with _make_fake_open():
            self.authenticate(self.user)
            resp = self.client.get(f"/api/books/{self.free_book.id}/document/")
            self.assertEqual(resp.status_code, 200)
        self.assertEqual(self._count(self.free_book), 0)

    def test_get_document_does_not_create_download_history(self):
        with _make_fake_open():
            self.authenticate(self.user)
            self.client.get(f"/api/books/{self.free_book.id}/document/")
        self.assertFalse(Download.objects.filter(user=self.user, book=self.free_book).exists())

    def test_post_download_increments_counter_exactly_once(self):
        with _make_fake_open():
            self.authenticate(self.user)
            self.client.post(f"/api/books/{self.free_book.id}/download/")
        self.assertEqual(self._count(self.free_book), 1)

    def test_post_download_records_history(self):
        with _make_fake_open():
            self.authenticate(self.user)
            self.client.post(f"/api/books/{self.free_book.id}/download/")
        self.assertTrue(Download.objects.filter(user=self.user, book=self.free_book).exists())

    def test_repeated_post_downloads_do_not_duplicate_history(self):
        with _make_fake_open():
            self.authenticate(self.user)
            self.client.post(f"/api/books/{self.free_book.id}/download/")
            self.client.post(f"/api/books/{self.free_book.id}/download/")
        self.assertEqual(
            Download.objects.filter(user=self.user, book=self.free_book).count(), 1
        )
        self.assertEqual(self._count(self.free_book), 2)

    def test_unauthenticated_post_does_not_change_counter_or_history(self):
        resp = self.client.post(f"/api/books/{self.free_book.id}/download/")
        self.assertIn(resp.status_code, (401, 403))
        self.assertEqual(self._count(self.free_book), 0)
        self.assertEqual(Download.objects.count(), 0)

    def test_premium_blocked_post_does_not_change_counter_or_history(self):
        with _make_fake_open():
            self.authenticate(self.user)
            resp = self.client.post(f"/api/books/{self.premium_book.id}/download/")
            self.assertEqual(resp.status_code, 403)
        self.assertEqual(self._count(self.premium_book), 0)
        self.assertEqual(Download.objects.count(), 0)

    def test_premium_blocked_document_does_not_change_counter_or_history(self):
        with _make_fake_open():
            self.authenticate(self.user)
            resp = self.client.get(f"/api/books/{self.premium_book.id}/document/")
            self.assertEqual(resp.status_code, 403)
        self.assertEqual(self._count(self.premium_book), 0)
        self.assertEqual(Download.objects.count(), 0)
