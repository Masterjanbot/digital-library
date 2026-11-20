from rest_framework import permissions, viewsets
from apps.permissions import IsOwnerOrAdmin
from .models import ReadingProgress
from .serializers import ReadingProgressSerializer

class ReadingProgressViewSet(viewsets.ModelViewSet):
    queryset = ReadingProgress.objects.none()
    serializer_class = ReadingProgressSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwnerOrAdmin]
    http_method_names = ["get", "post", "put", "patch", "delete", "head", "options"]
    filterset_fields = ["book"]

    def get_queryset(self):
        return ReadingProgress.objects.filter(user=self.request.user).select_related("book")

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
