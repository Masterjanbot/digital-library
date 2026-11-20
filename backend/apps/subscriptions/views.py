from rest_framework import permissions, viewsets
from rest_framework.exceptions import PermissionDenied
from apps.permissions import IsCatalogManager
from .models import Subscription
from .serializers import SubscriptionSerializer

class SubscriptionViewSet(viewsets.ModelViewSet):
    queryset = Subscription.objects.none()
    serializer_class = SubscriptionSerializer

    def get_queryset(self):
        queryset = Subscription.objects.select_related("user")
        if self.request.user.is_superuser or self.request.user.role == "admin":
            return queryset
        return queryset.filter(user=self.request.user)

    def get_permissions(self):
        if self.action in {"create", "update", "partial_update", "destroy"}:
            return [IsCatalogManager()]
        return [permissions.IsAuthenticated()]

    def perform_create(self, serializer):
        if not (self.request.user.is_superuser or self.request.user.role == "admin"):
            raise PermissionDenied("Only administrators can change subscription plans.")
        serializer.save()

    def perform_update(self, serializer):
        if not (self.request.user.is_superuser or self.request.user.role == "admin"):
            raise PermissionDenied("Only administrators can change subscription plans.")
        serializer.save()

    def perform_destroy(self, instance):
        if not (self.request.user.is_superuser or self.request.user.role == "admin"):
            raise PermissionDenied("Only administrators can change subscription plans.")
        instance.delete()
