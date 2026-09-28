import re

from django.conf import settings
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import WebPushSubscription
from .web_push import valid_push_endpoint


KEY_PATTERN = re.compile(r"^[A-Za-z0-9_-]{16,255}$")


class WebPushSubscriptionView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        return Response({
            "enabled": bool(settings.WEB_PUSH_VAPID_PUBLIC_KEY and settings.WEB_PUSH_VAPID_PRIVATE_KEY and settings.WEB_PUSH_VAPID_SUBJECT),
            "public_key": settings.WEB_PUSH_VAPID_PUBLIC_KEY,
        })

    def post(self, request):
        if not all((settings.WEB_PUSH_VAPID_PUBLIC_KEY, settings.WEB_PUSH_VAPID_PRIVATE_KEY, settings.WEB_PUSH_VAPID_SUBJECT)):
            return Response({"detail": "Background alerts are not configured on the server."}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
        endpoint = str(request.data.get("endpoint") or "").strip()
        keys = request.data.get("keys") or {}
        p256dh = str(keys.get("p256dh") or "") if isinstance(keys, dict) else ""
        auth = str(keys.get("auth") or "") if isinstance(keys, dict) else ""
        if len(endpoint) > 2048 or not valid_push_endpoint(endpoint) or not KEY_PATTERN.fullmatch(p256dh) or not KEY_PATTERN.fullmatch(auth):
            return Response({"detail": "The browser push subscription is invalid."}, status=status.HTTP_400_BAD_REQUEST)
        WebPushSubscription.objects.update_or_create(
            endpoint=endpoint,
            defaults={"user": request.user, "p256dh": p256dh, "auth": auth},
        )
        old_ids = list(WebPushSubscription.objects.filter(user=request.user).order_by("-updated_at").values_list("id", flat=True)[10:])
        if old_ids:
            WebPushSubscription.objects.filter(id__in=old_ids).delete()
        return Response({"enabled": True}, status=status.HTTP_200_OK)

    def delete(self, request):
        endpoint = str(request.data.get("endpoint") or "").strip()
        if endpoint:
            WebPushSubscription.objects.filter(user=request.user, endpoint=endpoint).delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
