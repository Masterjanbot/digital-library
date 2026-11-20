from rest_framework.permissions import BasePermission, SAFE_METHODS

class IsStaffRoleOrReadOnly(BasePermission):
    allowed_roles = {"admin", "librarian", "editor"}

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        user = request.user
        return bool(user and user.is_authenticated and (user.is_superuser or user.role in self.allowed_roles))

class IsCatalogManager(BasePermission):
    allowed_roles = {"admin", "librarian", "editor"}

    def has_permission(self, request, view):
        user = request.user
        return bool(user and user.is_authenticated and (user.is_superuser or user.role in self.allowed_roles))

class IsOwnerOrAdmin(BasePermission):
    def has_object_permission(self, request, view, obj):
        return request.user.is_superuser or obj.user_id == request.user.id
