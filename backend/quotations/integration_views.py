"""Administrator-only integration setup. Secret values are never returned."""

from django.conf import settings
from django.db import transaction
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import BharathUser

from .integration_secrets import GOOGLE_MAPS_NAME, google_maps_key_status, save_google_maps_key
from .models import PlatformIntegrationSecret, SupportActionLog


class AdminGoogleMapsKeyView(APIView):
    permission_classes = [IsAuthenticated]

    def _allowed(self, user):
        return user.is_superuser or user.role == BharathUser.Roles.ADMIN

    def _response(self):
        response = Response(google_maps_key_status())
        response["Cache-Control"] = "no-store"
        return response

    def get(self, request):
        if not self._allowed(request.user):
            return Response({"detail": "Administrator access only."}, status=status.HTTP_403_FORBIDDEN)
        return self._response()

    @transaction.atomic
    def put(self, request):
        if not self._allowed(request.user):
            return Response({"detail": "Administrator access only."}, status=status.HTTP_403_FORBIDDEN)
        key = str(request.data.get("api_key") or "").strip()
        if not 20 <= len(key) <= 300 or any(char.isspace() for char in key):
            return Response({"api_key": "Enter a valid Google Maps API key."}, status=status.HTTP_400_BAD_REQUEST)
        previous = google_maps_key_status()
        save_google_maps_key(key, request.user)
        record = PlatformIntegrationSecret.objects.get(name=GOOGLE_MAPS_NAME)
        SupportActionLog.objects.create(
            actor=request.user, action="INTEGRATION_KEY_SAVED", target_type="INTEGRATION", target_id=record.pk,
            reason="Administrator saved the Google Maps address lookup key.",
            before={"configured": previous["configured"], "source": previous["source"]},
            after={"configured": True, "source": "ADMIN"},
        )
        return self._response()

    @transaction.atomic
    def delete(self, request):
        if not self._allowed(request.user):
            return Response({"detail": "Administrator access only."}, status=status.HTTP_403_FORBIDDEN)
        record = PlatformIntegrationSecret.objects.filter(name=GOOGLE_MAPS_NAME).first()
        if record:
            SupportActionLog.objects.create(
                actor=request.user, action="INTEGRATION_KEY_REMOVED", target_type="INTEGRATION", target_id=record.pk,
                reason="Administrator removed the Google Maps address lookup key.",
                before={"configured": True, "source": "ADMIN"},
                after={"configured": bool(settings.GOOGLE_MAPS_API_KEY), "source": "ENVIRONMENT" if settings.GOOGLE_MAPS_API_KEY else "NONE"},
            )
            record.delete()
        return self._response()
