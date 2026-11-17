"""Small shared guards for the existing email OTP and signed-reset flow."""
import hashlib
import secrets
from collections.abc import Mapping
from ipaddress import ip_address, ip_network

from django.core import signing
from django.conf import settings
from django.core.cache import cache
from django.utils import timezone
from django.utils.crypto import salted_hmac
from django.utils.dateparse import parse_datetime
from rest_framework.throttling import BaseThrottle, ScopedRateThrottle
from rest_framework.views import APIView
from rest_framework.exceptions import ValidationError

from .email_setup import otp_policy
from .mobile import normalize_mobile
from .auth_infrastructure import AuthenticationUnavailable, require_security_cache

RECOVERY_CHALLENGE_SALT = "bharath-painters-recovery-challenge"
RECOVERY_MESSAGE = "If this account has a verified recovery email, a verification code will be sent."


class AuthAPIView(APIView):
    def initial(self, request, *args, **kwargs):
        if request.method in {"POST", "PUT", "PATCH"} and not isinstance(request.data, Mapping):
            raise ValidationError({"detail": "Submit authentication details as an object."})
        return super().initial(request, *args, **kwargs)


class AuthScopedRateThrottle(ScopedRateThrottle):
    """Never let an untrusted forwarding header choose the auth rate bucket."""
    def allow_request(self, request, view):
        if settings.DEBUG:
            return super().allow_request(request, view)
        require_security_cache()
        self.scope = getattr(view, self.scope_attr, None)
        if not self.scope:
            return True
        self.rate = self.get_rate()
        self.num_requests, self.duration = self.parse_rate(self.rate)
        if not self.rate:
            raise AuthenticationUnavailable()
        # Atomic Redis ADD/INCR prevents the concurrent get/list/set race in
        # DRF's approximate throttle. Fixed UTC windows have boundary bursts.
        now = self.timer()
        window = int(now // self.duration)
        digest = hashlib.sha256(f"{self.scope}:{self.get_ident(request)}".encode()).hexdigest()
        key = f"auth-limit:v1:{digest}:{window}"
        self.retry_after = max(1, (window + 1) * self.duration - now)
        try:
            cache.add(key, 0, timeout=self.duration + 1)
            count = cache.incr(key)
        except Exception:
            raise AuthenticationUnavailable() from None
        return count <= self.num_requests

    def wait(self):
        if not settings.DEBUG:
            return self.retry_after
        return super().wait()

    def get_ident(self, request):
        try:
            peer = ip_address(request.META.get("REMOTE_ADDR", ""))
        except ValueError:
            return "unknown-peer"
        configured = getattr(settings, "AUTH_TRUSTED_PROXY_CIDRS", [])
        try:
            if not isinstance(configured, (list, tuple)):
                raise ValueError()
            networks = [ip_network(value) for value in configured]
        except (ValueError, TypeError):
            networks = []  # Bad configuration fails closed to the actual peer.
        trusted = lambda address: any(address in network for network in networks)
        if not trusted(peer):
            return str(peer)
        forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
        if not forwarded or len(forwarded) > 2048:
            return str(peer)
        try:
            chain = [ip_address(part.strip()) for part in forwarded.split(",")] + [peer]
        except ValueError:
            return str(peer)
        while len(chain) > 1 and trusted(chain[-1]):
            chain.pop()
        return str(chain[-1])


def positive_id(value):
    if isinstance(value, bool) or not isinstance(value, (int, str)):
        return None
    if isinstance(value, str) and (not value.isascii() or not value.isdecimal() or len(value) > 19):
        return None
    value = int(value)
    return value if 0 < value <= 2**63 - 1 else None


def recovery_challenge(mobile, role, recovery_request_id=None):
    # Same payload for eligible/ineligible accounts: no DB ID or eligibility bit.
    payload = {"mobile": mobile, "role": role,
                          "issued_at": timezone.now().isoformat(),
                          "nonce": secrets.token_urlsafe(18)}
    if recovery_request_id is not None:
        payload["recovery_request_id"] = str(recovery_request_id)
    return signing.dumps(payload, salt=RECOVERY_CHALLENGE_SALT)


def read_recovery_challenge(value):
    if not isinstance(value, str) or len(value) > 2048:
        return None
    try:
        data = signing.loads(value, salt=RECOVERY_CHALLENGE_SALT, max_age=3600)
        if not isinstance(data, dict) or not all(isinstance(data.get(k), str) for k in ("mobile", "role", "issued_at", "nonce")):
            return None
        issued_at = parse_datetime(data["issued_at"])
        if not issued_at or timezone.is_naive(issued_at) or issued_at > timezone.now():
            return None
        return data, issued_at
    except (signing.BadSignature, ValueError, TypeError):
        return None


def password_state(user):
    # Signed tokens are readable; never include the stored password hash itself.
    return salted_hmac("bharath-painters-reset-password-state", user.password).hexdigest()


class RecoveryIdentityCooldown(BaseThrottle):
    """Apply equal cooldowns to submitted identities, even when no user exists."""
    def allow_request(self, request, view):
        require_security_cache()
        mobile = normalize_mobile(request.data.get("mobile"))
        role = str(request.data.get("role") or "CUSTOMER").upper()
        if not mobile:
            return True  # View reports invalid syntax without looking up an account.
        seconds = otp_policy().resend_seconds
        identity = hashlib.sha256(f"{role}:{mobile}".encode()).hexdigest()
        key = "auth-email-cooldown:" + identity
        now = timezone.now().timestamp()
        try:
            if cache.add(key, now + seconds, timeout=seconds):
                return True
            self.retry_after = max(1, float(cache.get(key, now + seconds)) - now)
        except Exception:
            raise AuthenticationUnavailable() from None
        return False

    def wait(self):
        return self.retry_after
