from django.contrib.auth import get_user_model, password_validation
from rest_framework import serializers

from .models import TrustedContact

User = get_user_model()


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ["id", "username", "email", "first_name"]
        read_only_fields = fields


class SignupSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    first_name = serializers.CharField(max_length=150, required=False, allow_blank=True)
    password = serializers.CharField(write_only=True, trim_whitespace=False)

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError("That username is already in use.")
        return value

    def validate_email(self, value):
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError("That email address is already in use.")
        return value

    def validate_password(self, value):
        password_validation.validate_password(value)
        return value

    def create(self, validated_data):
        password = validated_data.pop("password")
        return User.objects.create_user(password=password, **validated_data)


class TrustedContactSerializer(serializers.ModelSerializer):
    email = serializers.EmailField(required=True, allow_blank=False)
    invitation_code = serializers.SerializerMethodField()

    class Meta:
        model = TrustedContact
        fields = ["id", "name", "email", "phone", "relationship", "invitation_code", "accepted_at", "is_active"]
        read_only_fields = ["id", "invitation_code", "accepted_at", "is_active"]

    def get_invitation_code(self, contact):
        if not contact.invitation_code:
            contact.save(update_fields=["invitation_code"])
        return contact.invitation_code
