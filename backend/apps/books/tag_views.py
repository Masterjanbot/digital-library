from rest_framework import viewsets
from apps.permissions import IsStaffRoleOrReadOnly
from .models import Tag
from .tag_serializers import TagSerializer

class TagViewSet(viewsets.ModelViewSet):
    queryset = Tag.objects.all().order_by("name")
    serializer_class = TagSerializer
    permission_classes = [IsStaffRoleOrReadOnly]
    search_fields = ["name"]
