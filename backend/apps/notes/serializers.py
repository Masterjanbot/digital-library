from rest_framework import serializers
from apps.books.access import can_access_book
from .models import Note

class NoteSerializer(serializers.ModelSerializer):
    book_title = serializers.CharField(source="book.title", read_only=True)

    class Meta:
        model = Note
        fields = ("id", "book", "book_title", "page", "title", "content", "created_at", "updated_at")
        read_only_fields = ("id", "created_at", "updated_at")

    def validate_book(self, book):
        if not can_access_book(book, self.context["request"].user):
            raise serializers.ValidationError("This book is not available.")
        return book
