from io import BytesIO

from PIL import Image
from django.contrib.auth import get_user_model
from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase
from apps.authors.models import Author
from apps.books.models import Book
from apps.categories.models import Category
from apps.notes.models import Note
from apps.bookmarks.models import Bookmark
from apps.reading_progress.models import ReadingProgress
from apps.subscriptions.models import Subscription

User = get_user_model()

class LibraryApiTests(APITestCase):
    def setUp(self):
        self.user = User.objects.create_user(username="reader", password="secure-pass-12345")
        self.other = User.objects.create_user(username="other", password="secure-pass-12345")
        self.author = Author.objects.create(name="Example Author")
        self.category = Category.objects.create(name="History")
        self.book = Book.objects.create(title="Example Book", page_count=100, category=self.category)
        self.book.authors.add(self.author)
        self.staff = User.objects.create_superuser(username="admin", password="secure-pass-12345", email="admin@example.com")

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def test_registration_creates_normal_user_and_free_plan(self):
        response = self.client.post("/api/auth/register/", {
            "username": "newreader", "email": "new@example.com", "password": "valid-password-123",
            "role": "admin",
        })
        self.assertEqual(response.status_code, 201)
        registered = User.objects.get(username="newreader")
        self.assertEqual(registered.role, User.Role.USER)
        self.assertFalse(registered.is_staff)
        self.assertEqual(Subscription.objects.get(user=registered).plan, Subscription.Plan.FREE)

    def test_registration_accepts_eight_character_password_matching_username(self):
        password = "qzjv7p4x"
        response = self.client.post("/api/auth/register/", {
            "username": password,
            "email": "eight-char@example.com",
            "password": password,
        })

        self.assertEqual(response.status_code, 201, response.data)
        registered = User.objects.get(username=password)
        self.assertTrue(registered.check_password(password))

    def test_preferred_language_choices_include_only_english_and_persian(self):
        language_field = User._meta.get_field("preferred_language")
        self.assertEqual(language_field.choices, [("en", "English"), ("fa", "Persian")])
        self.assertEqual(language_field.default, "en")
        self.assertEqual(self.user.preferred_language, "en")

    def test_jwt_login_and_logout_blacklist_refresh_token(self):
        response = self.client.post("/api/auth/login/", {"username": "reader", "password": "secure-pass-12345"})
        self.assertEqual(response.status_code, 200)
        refresh = response.data["refresh"]
        logout = self.client.post("/api/auth/logout/", {"refresh": refresh})
        self.assertEqual(logout.status_code, 205)
        refresh_response = self.client.post("/api/auth/refresh/", {"refresh": refresh})
        self.assertEqual(refresh_response.status_code, 401)

    def test_public_book_search_and_staff_crud(self):
        response = self.client.get("/api/books/?search=Example")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.authenticate(self.user)
        created = self.client.post("/api/books/", {"title": "My draft"})
        self.assertEqual(created.status_code, 403)
        librarian = User.objects.create_user(username="librarian", password="secure-pass-12345", role=User.Role.LIBRARIAN)
        self.authenticate(librarian)
        created = self.client.post("/api/books/", {"title": "Library book"})
        self.assertEqual(created.status_code, 201)
        self.assertEqual(Book.objects.get(pk=created.data["id"]).created_by, librarian)
        self.authenticate(self.staff)
        staff_created = self.client.post("/api/books/", {"title": "Created by staff"})
        self.assertEqual(staff_created.status_code, 201)
        self.assertEqual(staff_created.data["status"], Book.Status.PUBLISHED)
        featured = self.client.patch(f"/api/books/{staff_created.data['id']}/", {"is_featured": True})
        self.assertEqual(featured.status_code, 200)
        self.assertTrue(featured.data["is_featured"])

    def test_book_owner_can_manage_only_their_own_drafts(self):
        owned_book = Book.objects.create(
            title="Owner draft", created_by=self.user, status=Book.Status.DRAFT,
            visibility=Book.Visibility.PRIVATE,
        )
        self.authenticate(self.user)
        created = self.client.post("/api/books/", {"title": "Unauthorized upload", "visibility": "private"})
        self.assertEqual(created.status_code, 403)
        book_id = owned_book.id
        self.assertEqual(self.client.get("/api/books/mine/").data["count"], 1)
        self.assertEqual(self.client.get(f"/api/books/{book_id}/").status_code, 200)
        self.assertEqual(self.client.patch(f"/api/books/{book_id}/", {"title": "Updated"}).status_code, 403)
        self.assertEqual(self.client.patch(f"/api/books/{book_id}/", {"status": "published"}).status_code, 403)
        self.assertEqual(self.client.patch(f"/api/books/{book_id}/", {"is_premium": True}).status_code, 403)
        self.assertEqual(self.client.patch(f"/api/books/{book_id}/", {"is_featured": True}).status_code, 403)
        self.assertEqual(self.client.delete(f"/api/books/{book_id}/").status_code, 403)
        self.assertEqual(Book.objects.get(pk=book_id).title, "Owner draft")
        self.client.force_authenticate(user=None)
        public_catalog = self.client.get("/api/books/")
        self.assertNotIn(book_id, [item["id"] for item in public_catalog.data["results"]])
        self.authenticate(self.other)
        self.assertEqual(self.client.get(f"/api/books/{book_id}/").status_code, 404)
        self.assertEqual(self.client.delete(f"/api/books/{book_id}/").status_code, 404)

    def test_normal_users_cannot_write_categories(self):
        self.authenticate(self.user)
        self.assertEqual(self.client.post("/api/categories/", {"name": "Unauthorized"}).status_code, 403)
        self.assertEqual(
            self.client.patch(f"/api/categories/{self.category.id}/", {"name": "Changed"}).status_code, 403,
        )
        self.assertEqual(self.client.delete(f"/api/categories/{self.category.id}/").status_code, 403)

    def test_profile_role_is_read_only_for_the_authenticated_user(self):
        self.authenticate(self.user)
        response = self.client.patch("/api/auth/profile/", {"role": "admin"})
        self.assertEqual(response.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, User.Role.USER)
        self.assertFalse(response.data["is_superuser"])

    def test_administrator_can_manage_roles_but_librarian_cannot_manage_users(self):
        admin = User.objects.create_user(username="library-admin", password="secure-pass-12345", role=User.Role.ADMIN)
        self.authenticate(admin)
        listed = self.client.get("/api/users/")
        self.assertEqual(listed.status_code, 200)
        promoted = self.client.patch(f"/api/users/{self.user.id}/", {"role": User.Role.LIBRARIAN})
        self.assertEqual(promoted.status_code, 200)
        self.user.refresh_from_db()
        self.assertEqual(self.user.role, User.Role.LIBRARIAN)
        administrator_role = self.client.patch(f"/api/users/{self.other.id}/", {"role": User.Role.ADMIN})
        self.assertEqual(administrator_role.status_code, 200)
        self.other.refresh_from_db()
        self.assertEqual(self.other.role, User.Role.ADMIN)

        librarian = User.objects.create_user(username="catalog-librarian", password="secure-pass-12345", role=User.Role.LIBRARIAN)
        self.authenticate(librarian)
        self.assertEqual(self.client.get("/api/users/").status_code, 403)
        self.assertEqual(self.client.patch(f"/api/users/{self.other.id}/", {"role": User.Role.ADMIN}).status_code, 403)

    def test_dashboard_reports_only_the_current_users_book_activity(self):
        own = Book.objects.create(title="My published book", created_by=self.user)
        Book.objects.create(title="Another user's book", created_by=self.other)
        ReadingProgress.objects.create(user=self.other, book=own, current_page=4)
        ReadingProgress.objects.create(user=self.user, book=self.book, current_page=2)
        self.authenticate(self.user)

        response = self.client.get("/api/dashboard/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total_books"], 1)
        self.assertEqual(response.data["published_books"], 1)
        self.assertEqual(response.data["draft_books"], 0)
        self.assertEqual(response.data["total_readers"], 1)
        self.assertEqual(response.data["total_reading_activity"], 1)
        self.assertEqual(response.data["recent_activity"][0]["book__id"], self.book.id)
        self.assertEqual(response.data["recent_activity"][0]["user__username"], self.user.username)

    def test_manager_dashboard_does_not_expose_other_readers_progress(self):
        ReadingProgress.objects.create(user=self.user, book=self.book, current_page=3)
        ReadingProgress.objects.create(user=self.staff, book=self.book, current_page=8)
        self.authenticate(self.staff)

        response = self.client.get("/api/dashboard/")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["total_reading_activity"], 2)
        self.assertEqual(len(response.data["recent_activity"]), 1)
        self.assertEqual(response.data["recent_activity"][0]["user__username"], self.staff.username)
        self.assertEqual(response.data["recent_activity"][0]["current_page"], 8)

    def test_premium_books_are_listed_without_granting_pdf_access(self):
        premium_book = Book.objects.create(title="Premium Book", is_premium=True)
        premium_book.document.name = "books/premium.pdf"
        premium_book.save(update_fields=["document"])
        Book.objects.create(title="Private Premium Book", is_premium=True, visibility=Book.Visibility.PRIVATE)

        catalog = self.client.get("/api/books/?is_premium=true")

        self.assertEqual(catalog.status_code, 200)
        listed_ids = [item["id"] for item in catalog.data["results"]]
        self.assertIn(premium_book.id, listed_ids)
        self.assertEqual(len(listed_ids), 1)
        self.authenticate(self.user)
        self.assertEqual(self.client.get(f"/api/books/{premium_book.id}/document/").status_code, 403)

    def test_private_books_are_hidden_and_invalid_pdf_upload_is_rejected(self):
        private_book = Book.objects.create(title="Private book", visibility=Book.Visibility.PRIVATE)
        self.authenticate(self.user)
        self.assertEqual(self.client.get(f"/api/books/{private_book.id}/").status_code, 404)
        self.authenticate(self.staff)
        upload = SimpleUploadedFile("invalid.pdf", b"not a pdf", content_type="application/pdf")
        response = self.client.post("/api/books/", {"title": "Invalid upload", "document": upload}, format="multipart")
        self.assertEqual(response.status_code, 400)

    def test_cover_upload_rejects_image_formats_outside_jpeg_png_webp(self):
        image = BytesIO()
        Image.new("RGB", (2, 2), color="white").save(image, format="GIF")
        image.seek(0)
        upload = SimpleUploadedFile("cover.gif", image.read(), content_type="image/gif")
        self.authenticate(self.staff)

        response = self.client.post(
            "/api/books/", {"title": "Unsupported cover", "cover": upload}, format="multipart",
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("cover", response.data)

    def test_personal_notes_are_isolated(self):
        Note.objects.create(user=self.user, book=self.book, content="Private note")
        Note.objects.create(user=self.other, book=self.book, content="Other private note")
        self.authenticate(self.user)
        response = self.client.get("/api/notes/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["content"], "Private note")

    def test_bookmarks_are_created_and_isolated(self):
        self.authenticate(self.user)
        created = self.client.post("/api/bookmarks/", {"book": self.book.id, "page": 3, "label": "Important"})
        self.assertEqual(created.status_code, 201)
        Bookmark.objects.create(user=self.other, book=self.book, page=4)
        self.assertEqual(self.client.get("/api/bookmarks/").data["count"], 1)

    def test_premium_content_requires_active_subscription(self):
        premium_book = Book.objects.create(title="Premium Book", is_premium=True)
        self.authenticate(self.user)
        blocked = self.client.post("/api/reading-progress/", {"book": premium_book.id, "current_page": 1})
        self.assertEqual(blocked.status_code, 400)
        Subscription.objects.create(user=self.user, plan=Subscription.Plan.PREMIUM, status=Subscription.Status.ACTIVE)
        allowed = self.client.post("/api/reading-progress/", {"book": premium_book.id, "current_page": 1})
        self.assertEqual(allowed.status_code, 201)

    def test_reading_progress_validates_page_and_computes_percentage(self):
        self.authenticate(self.user)
        response = self.client.post("/api/reading-progress/", {"book": self.book.id, "current_page": 25})
        self.assertEqual(response.status_code, 201)
        progress = ReadingProgress.objects.get(user=self.user, book=self.book)
        self.assertEqual(str(progress.percentage), "25.00")
        invalid = self.client.patch(f"/api/reading-progress/{progress.id}/", {"current_page": 101})
        self.assertEqual(invalid.status_code, 400)

    def test_subscription_changes_are_staff_only_and_user_scoped(self):
        own = Subscription.objects.create(user=self.user)
        Subscription.objects.create(user=self.other)
        self.authenticate(self.user)
        self.assertEqual(self.client.get("/api/subscriptions/").data["count"], 1)
        self.assertEqual(self.client.patch(f"/api/subscriptions/{own.id}/", {"plan": "premium"}).status_code, 403)
