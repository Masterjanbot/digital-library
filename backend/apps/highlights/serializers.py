from rest_framework import serializers
from apps.books.access import can_access_book
from .models import Highlight

class HighlightSerializer(serializers.ModelSerializer):
    class Meta:
        model = Highlight
        fields = ("id", "book", "page", "text", "color", "created_at")
        read_only_fields = ("id", "created_at")

    def validate_book(self, book):
        if not can_access_book(book, self.context["request"].user):
            raise serializers.ValidationError("This book is not available.")
        return book
