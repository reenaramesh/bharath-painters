"""Block unrelated Django mail during the single-recipient Brevo test."""
from django.core.mail.backends.base import BaseEmailBackend


class EmailBackend(BaseEmailBackend):
    def send_messages(self, email_messages):
        if email_messages:
            # Controlled auth uses the existing HTTPS adapter directly. Never
            # let support/admin/third-party direct mail bypass its allowlist.
            raise RuntimeError("Direct Django email is disabled during controlled Brevo testing.")
        return 0
