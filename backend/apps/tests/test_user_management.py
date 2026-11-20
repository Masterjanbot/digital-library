from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from rest_framework.test import APITestCase

User = get_user_model()


class UserManagementApiTests(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_user(
            username="library-admin",
            password="Secure-admin-password-473!",
            email="admin@example.com",
            role=User.Role.ADMIN,
        )
        self.superuser = User.objects.create_superuser(
            username="root-admin",
            password="Secure-root-password-473!",
            email="root@example.com",
        )
        self.reader = User.objects.create_user(
            username="reader-one",
            password="Secure-reader-password-473!",
            email="reader@example.com",
        )

    def authenticate(self, user):
        self.client.force_authenticate(user=user)

    def user_payload(self, **overrides):
        return {
            "username": "new-reader",
            "email": "new-reader@example.com",
            "first_name": "New",
            "last_name": "Reader",
            "role": User.Role.USER,
            "password": "Distant!83-Bookshelf",
            "password_confirm": "Distant!83-Bookshelf",
            **overrides,
        }

    def test_user_api_requires_admin_authentication(self):
        self.assertIn(self.client.get("/api/users/").status_code, (401, 403))
        self.assertIn(self.client.post("/api/users/", self.user_payload()).status_code, (401, 403))

        self.authenticate(self.reader)
        self.assertEqual(self.client.get("/api/users/").status_code, 403)
        self.assertEqual(self.client.post("/api/users/", self.user_payload()).status_code, 403)

    def test_admin_can_search_filter_and_paginate_users(self):
        User.objects.create_user(
            username="librarian-one",
            password="Secure-librarian-password-473!",
            email="librarian@example.com",
            role=User.Role.LIBRARIAN,
        )
        self.authenticate(self.admin)

        page = self.client.get("/api/users/?page_size=1&page=1")
        self.assertEqual(page.status_code, 200)
        self.assertEqual(len(page.data["results"]), 1)
        self.assertIsNotNone(page.data["next"])

        filtered = self.client.get("/api/users/?search=reader&role=user&is_active=true")
        self.assertEqual(filtered.status_code, 200)
        self.assertEqual(filtered.data["count"], 1)
        self.assertEqual(filtered.data["results"][0]["username"], self.reader.username)

    def test_create_hashes_password_assigns_role_and_never_returns_credentials(self):
        self.authenticate(self.admin)
        response = self.client.post(
            "/api/users/",
            self.user_payload(role=User.Role.EDITOR),
            format="json",
        )

        self.assertEqual(response.status_code, 201)
        self.assertNotIn("password", response.data)
        self.assertNotIn("password_confirm", response.data)
        self.assertNotIn("is_staff", response.data)
        self.assertNotIn("groups", response.data)
        created = User.objects.get(username="new-reader")
        self.assertEqual(created.role, User.Role.EDITOR)
        self.assertTrue(created.check_password("Distant!83-Bookshelf"))
        self.assertFalse(created.is_staff)
        self.assertFalse(created.is_superuser)

    def test_create_rejects_duplicate_username_and_case_insensitive_email(self):
        self.authenticate(self.admin)
        duplicate_username = self.client.post(
            "/api/users/",
            self.user_payload(username=self.reader.username),
            format="json",
        )
        duplicate_email = self.client.post(
            "/api/users/",
            self.user_payload(email="READER@example.com"),
            format="json",
        )

        self.assertEqual(duplicate_username.status_code, 400)
        self.assertIn("username", duplicate_username.data)
        self.assertEqual(duplicate_email.status_code, 400)
        self.assertIn("email", duplicate_email.data)
        self.assertEqual(User.objects.count(), 3)

    def test_database_rejects_case_insensitive_duplicate_emails(self):
        with self.assertRaises(IntegrityError):
            with transaction.atomic():
                User.objects.create_user(
                    username="duplicate-reader",
                    password="Secure-duplicate-password-473!",
                    email="READER@example.com",
                )

    def test_create_requires_matching_strong_password(self):
        self.authenticate(self.admin)
        mismatch = self.client.post(
            "/api/users/",
            self.user_payload(password_confirm="Different!83-Bookshelf"),
            format="json",
        )
        weak_password = self.client.post(
            "/api/users/",
            self.user_payload(password="short", password_confirm="short"),
            format="json",
        )

        self.assertEqual(mismatch.status_code, 400)
        self.assertIn("password_confirm", mismatch.data)
        self.assertEqual(weak_password.status_code, 400)
        self.assertIn("password", weak_password.data)
        self.assertEqual(User.objects.count(), 3)

    def test_admin_can_create_eight_character_password_matching_username(self):
        self.authenticate(self.admin)
        password = "qzjv7p4x"
        response = self.client.post(
            "/api/users/",
            self.user_payload(username=password, password=password, password_confirm=password),
            format="json",
        )

        self.assertEqual(response.status_code, 201, response.data)
        created = User.objects.get(username=password)
        self.assertTrue(created.check_password(password))

    def test_registration_rejects_existing_email(self):
        response = self.client.post("/api/auth/register/", {
            "username": "duplicate-email",
            "email": "READER@example.com",
            "password": "Different!83-Bookshelf",
        })

        self.assertEqual(response.status_code, 400)
        self.assertIn("email", response.data)
        self.assertFalse(User.objects.filter(username="duplicate-email").exists())

    def test_admin_can_edit_details_roles_and_active_state(self):
        self.authenticate(self.admin)
        response = self.client.patch(
            f"/api/users/{self.reader.id}/",
            {
                "username": "reader-updated",
                "email": "reader-updated@example.com",
                "first_name": "Updated",
                "last_name": "Reader",
                "role": User.Role.PREMIUM,
                "is_active": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 200)
        self.reader.refresh_from_db()
        self.assertEqual(self.reader.username, "reader-updated")
        self.assertEqual(self.reader.email, "reader-updated@example.com")
        self.assertEqual(self.reader.first_name, "Updated")
        self.assertEqual(self.reader.role, User.Role.PREMIUM)
        self.assertFalse(self.reader.is_active)

        reactivated = self.client.patch(
            f"/api/users/{self.reader.id}/",
            {"is_active": True},
            format="json",
        )
        self.assertEqual(reactivated.status_code, 200)
        self.reader.refresh_from_db()
        self.assertTrue(self.reader.is_active)

    def test_admin_cannot_take_over_or_modify_superuser(self):
        self.authenticate(self.admin)
        response = self.client.patch(
            f"/api/users/{self.superuser.id}/",
            {
                "email": "taken-over@example.com",
                "password": "Replacement!84-Password",
                "password_confirm": "Replacement!84-Password",
                "role": User.Role.USER,
                "is_active": False,
            },
            format="json",
        )

        self.assertEqual(response.status_code, 403)
        self.superuser.refresh_from_db()
        self.assertEqual(self.superuser.email, "root@example.com")
        self.assertTrue(self.superuser.check_password("Secure-root-password-473!"))
        self.assertTrue(self.superuser.is_active)
        self.assertTrue(self.superuser.is_superuser)

    def test_superuser_can_manage_superuser_records(self):
        self.authenticate(self.superuser)
        response = self.client.patch(
            f"/api/users/{self.admin.id}/",
            {"role": User.Role.LIBRARIAN},
            format="json",
        )
        self.assertEqual(response.status_code, 200)
        self.admin.refresh_from_db()
        self.assertEqual(self.admin.role, User.Role.LIBRARIAN)

    def test_delete_is_available_to_admin_but_not_for_self_or_superuser_target(self):
        self.authenticate(self.admin)
        deleted = self.client.delete(f"/api/users/{self.reader.id}/")
        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(User.objects.filter(pk=self.reader.pk).exists())

        self.assertEqual(self.client.delete(f"/api/users/{self.admin.id}/").status_code, 400)
        self.assertTrue(User.objects.filter(pk=self.admin.pk).exists())
        self.assertEqual(self.client.delete(f"/api/users/{self.superuser.id}/").status_code, 403)
        self.assertTrue(User.objects.filter(pk=self.superuser.pk).exists())
