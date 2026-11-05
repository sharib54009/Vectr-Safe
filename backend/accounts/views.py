from django.contrib.auth import authenticate, login, logout
from django.http import JsonResponse
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import TrustedContact
from .serializers import SignupSerializer, TrustedContactSerializer, UserSerializer


@ensure_csrf_cookie
def csrf_cookie(request):
    return JsonResponse({"detail": "CSRF cookie set."})


class SignupView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @method_decorator(csrf_protect)
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)

    def post(self, request):
        serializer = SignupSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        login(request, user)
        return Response(UserSerializer(user).data, status=status.HTTP_201_CREATED)


class LoginView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    @method_decorator(csrf_protect)
    def dispatch(self, *args, **kwargs):
        return super().dispatch(*args, **kwargs)

    def post(self, request):
        user = authenticate(request, username=request.data.get("username", ""), password=request.data.get("password", ""))
        if user is None:
            return Response({"detail": "Username or password is incorrect."}, status=status.HTTP_400_BAD_REQUEST)
        login(request, user)
        return Response(UserSerializer(user).data)


class CurrentUserView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response(UserSerializer(request.user).data)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        logout(request)
        return Response(status=status.HTTP_204_NO_CONTENT)


class TrustedContactListCreateView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        contacts = TrustedContact.objects.filter(user=request.user, is_active=True).order_by("created_at")
        return Response(TrustedContactSerializer(contacts, many=True).data)

    def post(self, request):
        serializer = TrustedContactSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        contact = serializer.save(user=request.user)
        return Response(TrustedContactSerializer(contact).data, status=status.HTTP_201_CREATED)


class TrustedContactDeleteView(APIView):
    permission_classes = [IsAuthenticated]

    def delete(self, request, contact_id):
        contact = TrustedContact.objects.filter(user=request.user, pk=contact_id, is_active=True).first()
        if contact is None:
            return Response({"detail": "Trusted contact not found."}, status=status.HTTP_404_NOT_FOUND)
        contact.is_active = False
        contact.save(update_fields=["is_active"])
        return Response(status=status.HTTP_204_NO_CONTENT)


class AcceptGuardianInvitationView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        invitation_code = request.data.get("invitation_code")
        contact = TrustedContact.objects.filter(
            invitation_code=invitation_code, is_active=True, guardian_user__isnull=True,
        ).select_related("user").first()
        if contact is None:
            return Response({"detail": "Invitation is invalid, expired, or already accepted."}, status=status.HTTP_404_NOT_FOUND)
        if not request.user.email or request.user.email.casefold() != contact.email.casefold():
            return Response({"detail": "Sign in with the email address invited by the rider."}, status=status.HTTP_403_FORBIDDEN)
        if contact.user_id == request.user.id:
            return Response({"detail": "You cannot accept your own invitation."}, status=status.HTTP_400_BAD_REQUEST)
        contact.guardian_user = request.user
        contact.accepted_at = timezone.now()
        contact.save(update_fields=["guardian_user", "accepted_at"])
        return Response({"detail": "Trusted contact invitation accepted."})
