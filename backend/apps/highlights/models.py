from django.conf import settings
from django.db import models

class Highlight(models.Model):
    class Color(models.TextChoices):
        YELLOW = "yellow", "Yellow"
        GREEN = "green", "Green"
        BLUE = "blue", "Blue"
        PINK = "pink", "Pink"

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name="highlights")
    book = models.ForeignKey("books.Book", on_delete=models.CASCADE, related_name="highlights")
    page = models.PositiveIntegerField()
    text = models.TextField(max_length=5000)
    color = models.CharField(max_length=10, choices=Color.choices, default=Color.YELLOW)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["page", "created_at"]
