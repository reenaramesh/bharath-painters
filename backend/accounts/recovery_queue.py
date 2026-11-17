"""Internal durable email work; public requests never resolve account eligibility."""
from datetime import timedelta

from django.db import connection, transaction
from django.utils import timezone

from .email_setup import otp_policy, public_email_delivery_available
from .models import BharathUser, PasswordRecoveryRequest, PasswordResetOTP


def process_recovery_request():
    # Never make provider calls or process queued email while explicitly off.
    if not public_email_delivery_available():
        return False
    with transaction.atomic():
        pending = PasswordRecoveryRequest.objects.select_for_update(
            skip_locked=connection.features.has_select_for_update_skip_locked,
        ).filter(processed_at__isnull=True, available_at__lte=timezone.now()).order_by("created_at", "pk")
        job = pending.first()
        if job is None:
            return False
        now = timezone.now()
        job.status = "SKIPPED"
        if job.created_at > now - timedelta(minutes=otp_policy().expiry_minutes):
            # Import here to keep the existing issuer/token implementation shared.
            from .views import _recovery_user, _issue_email_otp
            user = _recovery_user(job.mobile, job.role)
            if user is not None:
                user = BharathUser.objects.select_for_update().get(pk=user.pk)
                if user.is_active and user.recovery_email and user.recovery_email_verified:
                    issued, error = _issue_email_otp(user, PasswordResetOTP.Purpose.PASSWORD_RESET, user.recovery_email)
                    if issued:
                        job.challenge = issued[0]
                        job.status = "COMPLETE"
                    elif error.startswith(("Please wait", "Too many")):
                        recent = PasswordResetOTP.objects.filter(user=user,
                            purpose=PasswordResetOTP.Purpose.PASSWORD_RESET)
                        if error.startswith("Too many"):
                            # Legacy synchronous envelopes could still verify the
                            # current code when issuance hit its hourly cap. Keep
                            # that behavior without sending another email or
                            # bypassing the cap. All envelopes share OTP replay
                            # protection and current account/email validation.
                            current = recent.filter(is_used=False, verified_at__isnull=True,
                                expires_at__gt=now, target_email__iexact=user.recovery_email).first()
                            if current:
                                job.challenge = current
                                job.status = "COMPLETE"
                                job.processed_at = now
                                job.save(update_fields=("status", "challenge", "processed_at"))
                                return True
                            limiting = recent.filter(created_at__gte=now - timedelta(hours=1)).order_by("created_at").first()
                            resume_at = limiting.created_at + timedelta(hours=1, seconds=1)
                        else:
                            limiting = recent.order_by("-created_at").first()
                            resume_at = limiting.created_at + timedelta(seconds=otp_policy().resend_seconds)
                        job.available_at = max(now + timedelta(seconds=1), resume_at)
                        job.save(update_fields=("available_at",))
                        return True
                    else:
                        job.status = "FAILED"
        job.processed_at = now
        job.save(update_fields=("status", "challenge", "processed_at"))
        return True
