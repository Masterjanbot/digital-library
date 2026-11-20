from django.db import models

class Author(models.Model):
    name = models.CharField(max_length=180, db_index=True)
    biography = models.TextField(blank=True)
    birth_date = models.DateField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]
        constraints = [models.UniqueConstraint(fields=["name"], name="unique_author_name")]

    def __str__(self):
        return self.name
