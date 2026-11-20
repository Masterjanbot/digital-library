from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.db.models import F, Q
from django_filters.rest_framework import DjangoFilterBackend
from rest_framework import filters, permissions, status, viewsets
from django.db.models import Count, IntegerField, OuterRef, Subquery
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema
from .access import can_access_book, can_download_book
from .filters import DownloadFilter
from .models import Book, Download, DownloadEvent
from .serializers import BookSerializer, DownloadSerializer


class BookPermissions(permissions.BasePermission):
    safe_methods = {"GET", "HEAD", "OPTIONS"}
    catalog_manager_roles = {"admin", "librarian", "editor"}

    @classmethod
    def can_manage_catalog(cls, user):
        return bool(
            user and user.is_authenticated and (
                user.is_superuser or user.role in cls.catalog_manager_roles
            )
        )

    def has_permission(self, request, view):
        if request.method in self.safe_methods:
            return True
        if getattr(view, "detail", False):
            return bool(request.user and request.user.is_authenticated)
        return self.can_manage_catalog(request.user)

    def has_object_permission(self, request, view, obj):
        if request.method in self.safe_methods:
            return True
        return self.can_manage_catalog(request.user)


class BookViewSet(viewsets.ModelViewSet):
    queryset = Book.objects.all()
    serializer_class = BookSerializer
    permission_classes = [BookPermissions]
    search_fields = ["title", "subtitle", "description", "isbn", "authors__name"]
    filterset_fields = ["category", "publisher", "language", "visibility", "status", "is_featured", "is_premium", "tags__slug"]
    ordering_fields = ["title", "publication_date", "created_at", "updated_at", "download_count"]
    ordering = ["-created_at"]

    def get_queryset(self):
        queryset = Book.objects.select_related("category", "publisher").prefetch_related("authors", "tags")
        user = self.request.user
        if not user.is_authenticated:
            queryset = queryset.filter(visibility=Book.Visibility.PUBLIC, status=Book.Status.PUBLISHED)
        elif not (user.is_superuser or user.role in {"admin", "librarian", "editor"}):
            queryset = queryset.filter(
                Q(visibility=Book.Visibility.PUBLIC, status=Book.Status.PUBLISHED)
                | Q(created_by=user)
            )
        return queryset

    def perform_create(self, serializer):
        user = self.request.user
        serializer.save(created_by=user)

    @action(detail=False, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def mine(self, request):
        queryset = self.filter_queryset(
            Book.objects.filter(created_by=request.user)
            .select_related("category", "publisher")
            .prefetch_related("authors", "tags")
        )
        page = self.paginate_queryset(queryset)
        serializer = self.get_serializer(page if page is not None else queryset, many=True)
        if page is not None:
            return self.get_paginated_response(serializer.data)
        return Response(serializer.data)

    @action(detail=True, methods=["get"], permission_classes=[permissions.IsAuthenticated])
    def document(self, request, pk=None):
        book = self.get_object()
        if book.status != Book.Status.PUBLISHED and book.created_by_id != request.user.id and not (
            request.user.is_superuser
            or request.user.role in {"admin", "librarian", "editor"}
        ):
            raise Http404("Document not found.")
        if not book.document:
            raise Http404("Document not found.")
        if not can_access_book(book, request.user):
            raise PermissionDenied("An active premium subscription is required.")
        document = book.document.open("rb")
        return FileResponse(document, content_type="application/pdf", as_attachment=False, filename=f"book-{book.pk}.pdf")

    @action(detail=True, methods=["post"], permission_classes=[permissions.IsAuthenticated])
    def download(self, request, pk=None):
        book = self.get_object()
        if not can_download_book(book, request.user):
            raise PermissionDenied("This book is not available for download.")
        with transaction.atomic():
            Download.objects.get_or_create(user=request.user, book=book)
            Book.objects.filter(pk=book.pk).update(download_count=F("download_count") + 1)
            DownloadEvent.objects.create(user=request.user, book=book)
        document = book.document.open("rb")
        return FileResponse(
            document,
            content_type="application/pdf",
            as_attachment=True,
            filename=f"{book.title}.pdf",
        )


class BookCoverView(APIView):
    permission_classes = [permissions.AllowAny]

    @extend_schema(responses=OpenApiTypes.BINARY)
    def get(self, request, pk):
        public_book = Q(visibility=Book.Visibility.PUBLIC, status=Book.Status.PUBLISHED)
        if request.user.is_authenticated:
            is_manager = (
                request.user.is_superuser
                or request.user.role in {"admin", "librarian", "editor"}
            )
            visible_books = Book.objects.filter(pk=pk) if is_manager else Book.objects.filter(
                Q(pk=pk) & (public_book | Q(created_by=request.user))
            )
        else:
            visible_books = Book.objects.filter(public_book)
        book = get_object_or_404(visible_books, pk=pk)
        if not book.cover:
            raise Http404("Cover not found.")
        return FileResponse(book.cover.open("rb"))


class MyDownloadsViewSet(viewsets.ReadOnlyModelViewSet):
    """List the authenticated user's download history."""
    queryset = Download.objects.none()
    serializer_class = DownloadSerializer
    permission_classes = [permissions.IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_class = DownloadFilter
    search_fields = ["book__title", "book__authors__name"]

    def get_queryset(self):
        # Annotate how many successful download events this user recorded for
        # the same book, without adding queries to the page (correlated subquery).
        times_downloaded = (
            DownloadEvent.objects.filter(user=OuterRef("user"), book=OuterRef("book"))
            .order_by()
            .values("user", "book")
            .annotate(total=Count("pk"))
            .values("total")
        )
        return (
            Download.objects.filter(user=self.request.user)
            .select_related("book", "book__category", "book__publisher")
            .prefetch_related("book__authors")
            .annotate(times_downloaded=Subquery(times_downloaded, output_field=IntegerField()))
            .distinct()
        )

    @extend_schema(responses=OpenApiTypes.OBJECT)
    def list(self, request, *args, **kwargs):
        return super().list(request, *args, **kwargs)