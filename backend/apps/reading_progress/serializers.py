from rest_framework import serializers
from apps.books.access import can_access_book
from .models import ReadingProgress

class ReadingProgressSerializer(serializers.ModelSerializer):
    class Meta:
        model = ReadingProgress
        fields = ("id", "book", "current_page", "percentage", "last_read_at")
        read_only_fields = ("id", "last_read_at")

    def validate(self, attrs):
        book = attrs.get("book", getattr(self.instance, "book", None))
        page = attrs.get("current_page", getattr(self.instance, "current_page", 1))
        if book and not can_access_book(book, self.context["request"].user):
            raise serializers.ValidationError({"book": "This book is not available."})
        if book and book.page_count and page > book.page_count:
            raise serializers.ValidationError({"current_page": "Page cannot exceed the book's page count."})
        attrs["percentage"] = round((page / book.page_count) * 100, 2) if book and book.page_count else 0
        return attrs
