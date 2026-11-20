from rest_framework import permissions, viewsets
from apps.permissions import IsOwnerOrAdmin
from .models import Highlight
from .serializers import HighlightSerializer

class HighlightViewSet(viewsets.ModelViewSet):
    queryset = Highlight.objects.none()
    serializer_class = HighlightSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]

    def get_queryset(self):
        return Highlight.objects.filter(user=self.request.user).select_related("book")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
