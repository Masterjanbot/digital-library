from rest_framework import permissions, viewsets
from apps.permissions import IsOwnerOrAdmin
from .models import Bookmark
from .serializers import BookmarkSerializer

class BookmarkViewSet(viewsets.ModelViewSet):
    queryset = Bookmark.objects.none()
    serializer_class = BookmarkSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]

    def get_queryset(self):
        return Bookmark.objects.filter(user=self.request.user).select_related("book")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
