from rest_framework import viewsets
from apps.permissions import IsStaffRoleOrReadOnly
from .models import Publisher
from .serializers import PublisherSerializer

class PublisherViewSet(viewsets.ModelViewSet):
    queryset = Publisher.objects.all()
    serializer_class = PublisherSerializer
    permission_classes = [IsStaffRoleOrReadOnly]
    search_fields = ["name", "description"]
    ordering_fields = ["name", "created_at"]
    ordering = ["name"]
