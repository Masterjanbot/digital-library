from rest_framework import viewsets
from apps.permissions import IsStaffRoleOrReadOnly
from .models import Author
from .serializers import AuthorSerializer

class AuthorViewSet(viewsets.ModelViewSet):
    queryset = Author.objects.all()
    serializer_class = AuthorSerializer
    permission_classes = [IsStaffRoleOrReadOnly]
    search_fields = ["name", "biography"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]
