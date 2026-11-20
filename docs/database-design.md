# Database design

- **User** extends Django's `AbstractUser` with a single application role and preferred locale. Django `is_superuser` is the authoritative super-administrator grant. The application role is separate from Django groups and per-user permissions; the user-management API does not expose group membership or staff/superuser assignment.
- **Book** belongs optionally to one category and publisher and has many authors and tags. Book visibility and premium access are independent flags. ISBN is optional and unique when set.
- **Category**, **Author**, **Publisher**, and **Tag** are normalized catalog entities.
- **Bookmark**, **Highlight**, **Note**, and **ReadingProgress** belong to both a user and a book. Reading progress is unique per user/book; bookmarks are unique per user/book/page.
- **Subscription** records each plan/status interval, including start and optional expiration. Payment processing is intentionally not implemented.
- `Book.download_count` is incremented only after an authorized document is opened and supports aggregate dashboard reporting.

Database constraints and indexes cover frequently filtered catalog fields, user/book progress uniqueness, and bookmark uniqueness. Private reading models are queried through the authenticated user's ID and cannot be listed across accounts.
