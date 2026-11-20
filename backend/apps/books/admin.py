from django.contrib import admin
from .models import Book, Tag

@admin.register(Book)
class BookAdmin(admin.ModelAdmin):
    list_display = ("title", "status", "visibility", "is_featured", "is_premium", "created_at")
    list_filter = ("status", "visibility", "is_featured", "is_premium", "language")
    search_fields = ("title", "isbn", "authors__name")
    filter_horizontal = ("authors", "tags")

admin.site.register(Tag)
