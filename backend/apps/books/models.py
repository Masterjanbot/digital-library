from django.core.validators import FileExtensionValidator, MinValueValidator
from django.db import models
from django.utils import timezone
from django.utils.text import slugify

def validate_pdf_size(file):
    if not file.name.lower().endswith(".pdf"):
        from django.core.exceptions import ValidationError
        raise ValidationError("The uploaded document must be a PDF.")
    if file.size > 100 * 1024 * 1024:
        from django.core.exceptions import ValidationError
        raise ValidationError("PDF documents must be 100 MB or smaller.")
    position = file.tell()
    signature = file.read(5)
    file.seek(position)
    if signature != b"%PDF-":
        from django.core.exceptions import ValidationError
        raise ValidationError("The uploaded document is not a valid PDF.")

def validate_image_size(file):
    if file.size > 10 * 1024 * 1024:
        from django.core.exceptions import ValidationError
        raise ValidationError("Cover images must be 10 MB or smaller.")

class Tag(models.Model):
    name = models.CharField(max_length=60, unique=True)
    slug = models.SlugField(max_length=70, unique=True, blank=True)

    def save(self, *args, **kwargs):
        if not self.slug:
            base = slugify(self.name)[:60] or "tag"
            candidate = base
            suffix = 2
            while Tag.objects.filter(slug=candidate).exclude(pk=self.pk).exists():
                candidate = f"{base[:60 - len(str(suffix)) - 1]}-{suffix}"
                suffix += 1
            self.slug = candidate
        super().save(*args, **kwargs)

    def __str__(self):
        return self.name

class Book(models.Model):
    class Visibility(models.TextChoices):
        PUBLIC = "public", "Public"
        PRIVATE = "private", "Private"

    class Status(models.TextChoices):
        DRAFT = "draft", "Draft"
        PUBLISHED = "published", "Published"

    title = models.CharField(max_length=250, db_index=True)
    subtitle = models.CharField(max_length=250, blank=True)
    description = models.TextField(blank=True)
    isbn = models.CharField(max_length=20, blank=True, unique=True, null=True)
    language = models.CharField(max_length=20, default="en")
    publication_date = models.DateField(null=True, blank=True)
    edition = models.CharField(max_length=80, blank=True)
    page_count = models.PositiveIntegerField(null=True, blank=True, validators=[MinValueValidator(1)])
    cover = models.ImageField(upload_to="covers/", blank=True, validators=[FileExtensionValidator(["jpg", "jpeg", "png", "webp"]), validate_image_size])
    document = models.FileField(upload_to="books/", blank=True, validators=[FileExtensionValidator(["pdf"]), validate_pdf_size])
    authors = models.ManyToManyField("authors.Author", related_name="books", blank=True)
    publisher = models.ForeignKey("publishers.Publisher", related_name="books", on_delete=models.SET_NULL, null=True, blank=True)
    category = models.ForeignKey("categories.Category", related_name="books", on_delete=models.SET_NULL, null=True, blank=True)
    tags = models.ManyToManyField(Tag, related_name="books", blank=True)
    visibility = models.CharField(max_length=12, choices=Visibility.choices, default=Visibility.PUBLIC, db_index=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PUBLISHED, db_index=True)
    is_featured = models.BooleanField(default=False, db_index=True)
    is_premium = models.BooleanField(default=False, db_index=True)
    download_count = models.PositiveBigIntegerField(default=0)
    created_by = models.ForeignKey("accounts.User", related_name="created_books", on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]
        indexes = [models.Index(fields=["visibility", "is_premium", "created_at"])]

    def __str__(self):
        return self.title


class Download(models.Model):
    """Track user download history for books."""
    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="book_downloads")
    book = models.ForeignKey("books.Book", on_delete=models.CASCADE, related_name="downloads")
    downloaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-downloaded_at"]
        indexes = [
            models.Index(fields=["user", "book"]),
            models.Index(fields=["downloaded_at"]),
        ]
        constraints = [
            models.UniqueConstraint(fields=["user", "book"], name="unique_user_book_download"),
        ]

    def __str__(self):
        return f"{self.user.username} downloaded {self.book.title}"


class DownloadEvent(models.Model):
    """Records every successful book download as an individual event.

    The unique ``(user, book)`` contract on :class:`Download` only stores the
    first-time history entry, so repeated successful downloads cannot be
    counted from it. ``DownloadEvent`` is the event-level source of truth for
    "how many times X was downloaded" analytics. Pre-migration history rows
    are backfilled with a single event each (a lower bound for repeats,
    which were never recorded).
    """

    user = models.ForeignKey("accounts.User", on_delete=models.CASCADE, related_name="download_events")
    book = models.ForeignKey("books.Book", on_delete=models.CASCADE, related_name="download_events")
    downloaded_at = models.DateTimeField(default=timezone.now, db_index=True)

    class Meta:
        ordering = ["-downloaded_at", "-id"]
        indexes = [
            models.Index(fields=["user", "book"]),
            models.Index(fields=["book", "downloaded_at"]),
            models.Index(fields=["downloaded_at"]),
        ]

    def __str__(self):
        return f"{self.user.username} downloaded {self.book.title} at {self.downloaded_at:%Y-%m-%d %H:%M}"