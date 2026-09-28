"""Send existing portal notifications to opted-in browser devices."""

import json
import logging
from urllib.parse import urlparse

from django.conf import settings

from .models import PortalNotification, WebPushSubscription


logger = logging.getLogger(__name__)
PUSH_HOST_SUFFIXES = (
    "fcm.googleapis.com",
    "updates.push.services.mozilla.com",
    "push.services.mozilla.com",
    "web.push.apple.com",
    "notify.windows.com",
    "wns.windows.com",
)


def valid_push_endpoint(endpoint):
    try:
        parsed = urlparse(endpoint)
        host = (parsed.hostname or "").lower()
        return parsed.scheme == "https" and bool(host) and not parsed.username and not parsed.password and any(
            host == suffix or host.endswith("." + suffix) for suffix in PUSH_HOST_SUFFIXES
        )
    except ValueError:
        return False


def send_portal_push(notification_id):
    if not all((settings.WEB_PUSH_VAPID_PUBLIC_KEY, settings.WEB_PUSH_VAPID_PRIVATE_KEY, settings.WEB_PUSH_VAPID_SUBJECT)):
        return
    try:
        from pywebpush import WebPushException, webpush
    except ImportError:
        logger.warning("pywebpush is not installed; browser alerts are unavailable.")
        return

    notification = PortalNotification.objects.filter(pk=notification_id).first()
    if not notification:
        return
    payload = json.dumps({
        "title": notification.title,
        "body": notification.message,
        "url": notification.link if notification.link.startswith("/") and not notification.link.startswith("//") else "/dashboard",
        "id": notification.id,
    })
    for subscription in WebPushSubscription.objects.filter(user_id=notification.recipient_id)[:10]:
        if not valid_push_endpoint(subscription.endpoint):
            subscription.delete()
            continue
        try:
            webpush(
                subscription_info={"endpoint": subscription.endpoint, "keys": {"p256dh": subscription.p256dh, "auth": subscription.auth}},
                data=payload,
                vapid_private_key=settings.WEB_PUSH_VAPID_PRIVATE_KEY,
                vapid_claims={"sub": settings.WEB_PUSH_VAPID_SUBJECT},
                ttl=86400,
                timeout=3,
            )
        except WebPushException as error:
            response = getattr(error, "response", None)
            if response is not None and response.status_code in (404, 410):
                subscription.delete()
            else:
                logger.warning("Web push delivery failed for notification %s: %s", notification.id, type(error).__name__)
        except Exception:
            logger.exception("Unexpected web push delivery failure for notification %s", notification.id)
