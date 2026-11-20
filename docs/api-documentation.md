# REST API

All API routes are under `/api/`. JWT access tokens are sent in the `Authorization: Bearer <token>` header. Access tokens expire after 20 minutes; refresh tokens expire after 7 days and can be rotated. The interactive OpenAPI UI is at `/api/docs/`; the schema is `/api/schema/`.

| Route | Methods | Access |
|---|---|---|
| `/auth/register/` | POST | Public; always creates a normal user and free plan |
| `/auth/login/`, `/auth/refresh/`, `/auth/logout/` | POST | Login/refresh/logout |
| `/auth/profile/` | GET, PATCH | Authenticated account |
| `/auth/change-password/` | POST | Authenticated account |
| `/auth/password-reset/`, `/auth/password-reset/confirm/` | POST | Public reset workflow |
| `/books/`, `/books/{id}/` | GET; manager writes | Public catalog; private entries hidden from non-managers |
| `/books/{id}/document/` | GET | Authenticated; premium documents require an active premium subscription |
| `/books/{id}/cover/` | GET | Public cover for public books |
| `/categories/`, `/authors/`, `/publishers/` | GET; manager writes | Catalog access |
| `/tags/` | GET; manager writes | Catalog access |
| `/bookmarks/`, `/highlights/`, `/notes/`, `/reading-progress/` | CRUD | Authenticated, scoped to the current user |
| `/subscriptions/` | GET; manager writes | Current user's history or super-administrator list |
| `/notifications/` | GET, PATCH | Current user's notifications |
| `/users/` | CRUD | Authenticated application administrator or Django superuser |
| `/dashboard/` | GET | Authenticated role-specific aggregates |

Catalog list endpoints support page-number pagination, `search`, supported filter fields, and `ordering`. Uploads are limited to PDF (100 MB) and cover images (10 MB). Book documents are streamed by Django after authorization; the MinIO bucket is not exposed as a public web path.

User management supports page-number pagination, search across username, email, first name, and last name, and filters for `role` and `is_active`. Create requests require `username`, `email`, a valid application `role`, `password`, and matching `password_confirm`; passwords are write-only and validated with Django's password validators. Email addresses are case-insensitively unique at both the API and database layers (blank emails are excluded). Updates can change account details, role, and active state; password changes require both password fields. `is_staff`, `is_superuser`, Django groups, and per-user permissions are not writable through this API. Application administrators cannot change or delete Django superuser accounts, and users cannot deactivate or delete themselves. The email uniqueness migration checks existing data before adding its constraint and stops without modifying accounts if duplicate non-empty emails need manual resolution.
