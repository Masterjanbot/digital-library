from django.conf import settings
from django.core.validators import MinValueValidator
from django.db import models

class Bookmark(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="bookmarks")
    book = models.ForeignKey("books.Book", on_delete=models.CASCADE, related_name="bookmarks")
    page = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    label = models.CharField(max_length=160, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]
        constraints = [models.UniqueConstraint(fields=["user", "book", "page"], name="unique_bookmark_page_per_user")]
