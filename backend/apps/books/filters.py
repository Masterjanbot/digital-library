from django_filters import BooleanFilter, FilterSet

from .models import Download


class DownloadFilter(FilterSet):
    """Filters for the authenticated user's download history."""

    is_premium = BooleanFilter(field_name="book__is_premium")

    class Meta:
        model = Download
        fields = ["is_premium"]
