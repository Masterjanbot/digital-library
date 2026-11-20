from django.conf import settings
from django.db import models

class Note(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="notes")
    book = models.ForeignKey("books.Book", on_delete=models.CASCADE, related_name="notes")
    page = models.PositiveIntegerField(null=True, blank=True)
    title = models.CharField(max_length=180, blank=True)
    content = models.TextField(max_length=10000)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-updated_at"]
