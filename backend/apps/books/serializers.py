from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import serializers
from drf_spectacular.types import OpenApiTypes
from drf_spectacular.utils import extend_schema_field
from .models import Book, Download, Tag, validate_pdf_size


class BookSerializer(serializers.ModelSerializer):
    created_by = serializers.PrimaryKeyRelatedField(read_only=True)
    tags = serializers.SlugRelatedField(many=True, slug_field="slug", queryset=Tag.objects.all(), required=False)
    authors_display = serializers.StringRelatedField(source="authors", many=True, read_only=True)
    category_name = serializers.CharField(source="category.name", read_only=True)
    publisher_name = serializers.CharField(source="publisher.name", read_only=True)
    document_available = serializers.SerializerMethodField()
    cover_available = serializers.SerializerMethodField()
    cover = serializers.ImageField(write_only=True, required=False)
    document = serializers.FileField(write_only=True, required=False)

    class Meta:
        model = Book
        fields = (
            "id", "title", "subtitle", "description", "isbn", "language", "publication_date", "edition",
            "page_count", "authors", "authors_display", "publisher", "publisher_name", "category",
            "category_name", "tags", "visibility", "status", "is_featured", "is_premium", "cover", "document", "document_available", "cover_available",
            "created_by", "created_at", "updated_at",
        )
        read_only_fields = ("created_at", "updated_at")

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_document_available(self, obj) -> bool:
        return bool(obj.document)

    @extend_schema_field(OpenApiTypes.BOOL)
    def get_cover_available(self, obj) -> bool:
        return bool(obj.cover)

    def validate_document(self, document):
        try:
            validate_pdf_size(document)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc
        if document.content_type != "application/pdf":
            raise serializers.ValidationError("Only PDF documents are accepted.")
        return document

    def validate_cover(self, cover):
        if cover.size > 10 * 1024 * 1024:
            raise serializers.ValidationError("Cover images must be 10 MB or smaller.")
        if not cover.name.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
            raise serializers.ValidationError("Cover images must be JPEG, PNG, or WebP files.")
        if cover.content_type not in {"image/jpeg", "image/png", "image/webp"}:
            raise serializers.ValidationError("Cover images must be JPEG, PNG, or WebP files.")
        return cover

    def validate_isbn(self, value):
        return value or None

    def validate(self, attrs):
        request = self.context.get("request")
        if request and request.method in {"POST", "PUT", "PATCH"}:
            user = request.user
            can_manage_catalog = user.is_authenticated and (
                user.is_superuser or user.role in {"admin", "librarian", "editor"}
            )
            if not can_manage_catalog:
                status_value = attrs.get("status")
                premium_value = attrs.get("is_premium", self.instance.is_premium if self.instance else False)
                featured_value = attrs.get("is_featured", self.instance.is_featured if self.instance else False)
                if status_value is not None and status_value != Book.Status.DRAFT:
                    raise serializers.ValidationError({"status": "Only catalog managers can publish books."})
                if premium_value:
                    raise serializers.ValidationError({"is_premium": "Only catalog managers can mark books as premium."})
                if featured_value:
                    raise serializers.ValidationError({"is_featured": "Only catalog managers can feature books as featured."})
            if request.FILES.get("document") and request.FILES["document"].content_type != "application/pdf":
                raise serializers.ValidationError({"document": "Only PDF documents are accepted."})
            cover = request.FILES.get("cover")
            if cover and cover.content_type not in {"image/jpeg", "image/png", "image/webp"}:
                raise serializers.ValidationError({"cover": "A valid image file is required."})
        return attrs


class DownloadSerializer(serializers.ModelSerializer):
    book_title = serializers.CharField(source="book.title", read_only=True)
    book_author = serializers.SerializerMethodField()
    book_type = serializers.SerializerMethodField()
    cover_url = serializers.SerializerMethodField()
    is_premium = serializers.BooleanField(source="book.is_premium", read_only=True)
    times_downloaded = serializers.IntegerField(read_only=True, default=1)

    class Meta:
        model = Download
        fields = (
            "id", "book", "book_title", "book_author", "book_type", "is_premium",
            "cover_url", "downloaded_at", "times_downloaded",
        )
        read_only_fields = ("id", "downloaded_at", "book", "book_title", "book_author", "book_type", "is_premium", "cover_url", "times_downloaded")

    @extend_schema_field({"type": "array", "items": {"type": "string"}})
    def get_book_author(self, obj) -> list:
        # Uses the prefetched authors cache when available (MyDownloadsViewSet prefetches book__authors).
        return [author.name for author in obj.book.authors.all()]

    @extend_schema_field(OpenApiTypes.STR)
    def get_book_type(self, obj) -> str:
        return "Premium" if obj.book.is_premium else "Free"

    @extend_schema_field(OpenApiTypes.URI)
    def get_cover_url(self, obj) -> str:
        return f"/api/books/{obj.book.id}/cover/" if obj.book.cover else None