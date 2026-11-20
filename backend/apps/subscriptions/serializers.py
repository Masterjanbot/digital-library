from django.utils import timezone
from rest_framework import serializers
from .models import Subscription

class SubscriptionSerializer(serializers.ModelSerializer):
    class Meta:
        model = Subscription
        fields = ("id", "user", "plan", "status", "starts_at", "expires_at", "created_at")
        read_only_fields = ("id", "starts_at", "created_at")

    def validate(self, attrs):
        if attrs.get("plan", getattr(self.instance, "plan", None)) == Subscription.Plan.PREMIUM:
            expires_at = attrs.get("expires_at", getattr(self.instance, "expires_at", None))
            if expires_at and expires_at <= timezone.now():
                raise serializers.ValidationError({"expires_at": "Premium expiration must be in the future."})
        return attrs
