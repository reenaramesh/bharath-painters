"""Operator-only harmless test; dry-run unless explicitly confirmed."""
import json

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from accounts.email_setup import (CONTROLLED_BREVO_TEST_PURPOSE,
                                  controlled_brevo_configuration_error,
                                  send_configured_email)


class Command(BaseCommand):
    help = "Check controlled Brevo configuration, or send one harmless message with --confirm-send."

    def add_arguments(self, parser):
        parser.add_argument("--confirm-send", action="store_true", help="Explicitly request one actual allowlisted test message.")

    def handle(self, *args, **options):
        error = controlled_brevo_configuration_error()
        if error:
            raise CommandError(f"Controlled test unavailable: {error}. No message sent.")
        if not options["confirm_send"]:
            self.stdout.write(json.dumps({"status": "DRY_RUN", "provider": "BREVO", "network_calls": 0}))
            return
        receipt = {}
        accepted = send_configured_email(
            "Bharath Painters controlled email test",
            "This is the one-recipient Bharath Painters delivery test. It contains no OTP, password or activation link. "
            "No account or password has been changed. Check Brevo delivery logs and your Gmail inbox/spam folder.",
            settings.BREVO_TEST_RECIPIENT, CONTROLLED_BREVO_TEST_PURPOSE, delivery_receipt=receipt,
        )
        self.stdout.write(json.dumps(receipt, sort_keys=True))
        if not accepted:
            raise CommandError("Brevo acceptance was not confirmed. Inspect the diagnostic code; do not automatically retry an ambiguous timeout.")
        self.stdout.write("ACCEPTED is not DELIVERED. Confirm the message in Brevo logs and Gmail before enabling OTP testing.")
