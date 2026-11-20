from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from rest_framework import serializers, viewsets
from rest_framework.permissions import BasePermission
from rest_framework.exceptions import ValidationError

User = get_user_model()

class UserManagementPermission(BasePermission):
    def has_permission(self, request, view):
        user = request.user
        return bool(
            user and user.is_authenticated and (
                user.is_superuser or user.role == User.Role.ADMIN
            )
        )

    def has_object_permission(self, request, view, obj):
        if request.method in ("GET", "HEAD", "OPTIONS"):
            return True
        return request.user.is_superuser or not obj.is_superuser

class ManagedUserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, min_length=8)
    password_confirm = serializers.CharField(write_only=True, required=False, min_length=8)
    is_superuser = serializers.BooleanField(read_only=True)

    class Meta:
        model = User
        fields = ("id", "username", "email", "first_name", "last_name", "role", "is_active", "is_superuser", "password", "password_confirm")
        read_only_fields = ("id", "is_superuser")

    def validate_email(self, value):
        email = value.strip()
        existing = User.objects.filter(email__iexact=email)
        if self.instance:
            existing = existing.exclude(pk=self.instance.pk)
        if existing.exists():
            raise serializers.ValidationError("A user with this email address already exists.")
        return email

    def validate_password(self, value):
        candidate = User(
            username=self.initial_data.get("username", getattr(self.instance, "username", "")),
            email=self.initial_data.get("email", getattr(self.instance, "email", "")),
        )
        try:
            validate_password(value, user=candidate)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(exc.messages) from exc
        return value

    def validate(self, attrs):
        password = attrs.get("password")
        password_confirm = attrs.pop("password_confirm", None)
        if self.instance is None and not password:
            raise serializers.ValidationError({"password": "This field is required."})
        if password and password != password_confirm:
            raise serializers.ValidationError({"password_confirm": "Passwords do not match."})
        if password_confirm and not password:
            raise serializers.ValidationError({"password": "A password is required when confirming it."})
        return attrs

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        user = User(**validated_data)
        user.set_password(password)
        try:
            with transaction.atomic():
                user.save()
        except IntegrityError:
            errors = {}
            if User.objects.filter(email__iexact=user.email).exists():
                errors["email"] = "A user with this email address already exists."
            if User.objects.filter(username=user.username).exists():
                errors["username"] = "A user with that username already exists."
            if errors:
                raise serializers.ValidationError(errors)
            raise
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for field, value in validated_data.items():
            setattr(instance, field, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance

class UserManagementViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("username")
    serializer_class = ManagedUserSerializer
    permission_classes = [UserManagementPermission]
    search_fields = ["username", "email", "first_name", "last_name"]
    filterset_fields = ["role", "is_active"]
    ordering_fields = ["username", "date_joined", "role"]

    def perform_update(self, serializer):
        if serializer.instance.pk == self.request.user.pk and not serializer.validated_data.get("is_active", True):
            raise ValidationError({"is_active": "You cannot deactivate your own account."})
        serializer.save()

    def perform_destroy(self, instance):
        if instance.pk == self.request.user.pk:
            raise ValidationError("You cannot delete your own account.")
        instance.delete()
