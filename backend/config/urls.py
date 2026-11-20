from django.contrib import admin
from django.urls import include, path
from django.http import JsonResponse
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from apps.accounts.views import RegisterView, ProfileView, ChangePasswordView, PasswordResetRequestView, PasswordResetConfirmView, LogoutView
from apps.books.views import BookViewSet, BookCoverView, MyDownloadsViewSet
from apps.categories.views import CategoryViewSet
from apps.authors.views import AuthorViewSet
from apps.publishers.views import PublisherViewSet
from apps.bookmarks.views import BookmarkViewSet
from apps.highlights.views import HighlightViewSet
from apps.notes.views import NoteViewSet
from apps.reading_progress.views import ReadingProgressViewSet
from apps.reading_progress.session_views import (
    StartReadingSessionView,
    ReadingSessionHeartbeatView,
    EndReadingSessionView,
)
from apps.subscriptions.views import SubscriptionViewSet
from apps.analytics.views import DashboardView
from apps.analytics.reading_stats import ReadingActivityOverviewView, ReadingActivityUserView
from apps.analytics.my_reading_stats import MyReadingStatsView
from apps.analytics.download_stats import (
    AdminBookDownloadStatsView,
    AdminDownloadStatsOverviewView,
    AdminUserDownloadHistoryView,
    AdminUserDownloadStatsView,
    MyDownloadStatsView,
)
from apps.accounts.management_views import UserManagementViewSet
from apps.books.tag_views import TagViewSet
from apps.notifications.views import NotificationViewSet

router = DefaultRouter()
router.register("books", BookViewSet, basename="book")
router.register("downloads", MyDownloadsViewSet, basename="download")
router.register("categories", CategoryViewSet)
router.register("authors", AuthorViewSet)
router.register("publishers", PublisherViewSet)
router.register("bookmarks", BookmarkViewSet, basename="bookmark")
router.register("highlights", HighlightViewSet, basename="highlight")
router.register("notes", NoteViewSet, basename="note")
router.register("reading-progress", ReadingProgressViewSet, basename="reading-progress")
router.register("subscriptions", SubscriptionViewSet, basename="subscription")
router.register("users", UserManagementViewSet, basename="user")
router.register("tags", TagViewSet)
router.register("notifications", NotificationViewSet, basename="notification")

urlpatterns = [
    path("admin/", admin.site.urls),
    path("health/", lambda request: JsonResponse({"status": "ok"})),
    path("api/auth/register/", RegisterView.as_view(), name="register"),
    path("api/auth/login/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/logout/", LogoutView.as_view(), name="logout"),
    path("api/auth/profile/", ProfileView.as_view(), name="profile"),
    path("api/auth/change-password/", ChangePasswordView.as_view(), name="change-password"),
    path("api/auth/password-reset/", PasswordResetRequestView.as_view(), name="password-reset"),
    path("api/auth/password-reset/confirm/", PasswordResetConfirmView.as_view(), name="password-reset-confirm"),
    path("api/dashboard/", DashboardView.as_view(), name="dashboard"),
    path("api/reading/sessions/", StartReadingSessionView.as_view(), name="reading-session-start"),
    path("api/reading/sessions/<int:pk>/heartbeat/", ReadingSessionHeartbeatView.as_view(), name="reading-session-heartbeat"),
    path("api/reading/sessions/<int:pk>/end/", EndReadingSessionView.as_view(), name="reading-session-end"),
    path("api/reading/stats/", MyReadingStatsView.as_view(), name="my-reading-stats"),
    path("api/admin/analytics/overview/", ReadingActivityOverviewView.as_view(), name="admin-reading-analytics-overview"),
    path("api/admin/analytics/users/<int:user_id>/", ReadingActivityUserView.as_view(), name="admin-reading-analytics-user"),
    path("api/admin/download-stats/overview/", AdminDownloadStatsOverviewView.as_view(), name="admin-download-stats-overview"),
    path("api/admin/download-stats/books/", AdminBookDownloadStatsView.as_view(), name="admin-download-stats-books"),
    path("api/admin/download-stats/users/", AdminUserDownloadStatsView.as_view(), name="admin-download-stats-users"),
    path("api/admin/download-stats/users/<int:user_id>/history/", AdminUserDownloadHistoryView.as_view(), name="admin-download-stats-user-history"),
    path("api/me/download-stats/", MyDownloadStatsView.as_view(), name="my-download-stats"),
    path("api/books/<int:pk>/cover/", BookCoverView.as_view(), name="book-cover"),
    path("api/", include(router.urls)),
    path("api/schema/", SpectacularAPIView.as_view(), name="schema"),
    path("api/docs/", SpectacularSwaggerView.as_view(url_name="schema"), name="swagger-ui"),
]
