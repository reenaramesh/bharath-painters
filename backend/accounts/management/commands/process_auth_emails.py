"""Run as a private worker, never as a public endpoint or frontend process."""
import time

from django.core.management.base import BaseCommand, CommandError
from django.db import close_old_connections

from accounts.email_setup import public_email_delivery_available
from accounts.recovery_queue import process_recovery_request


class Command(BaseCommand):
    help = "Process durable password-recovery emails. Respects explicit email disable and sender verification."

    def add_arguments(self, parser):
        parser.add_argument("--once", action="store_true")
        parser.add_argument("--sleep", type=float, default=5)

    def handle(self, *args, **options):
        if not public_email_delivery_available():
            raise CommandError("Authentication email is disabled or not configured; no jobs processed.")
        while True:
            close_old_connections()
            try:
                processed = process_recovery_request()
            except Exception:
                # Never print submitted identities, OTPs, URLs, keys or DB errors.
                if options["once"]:
                    raise CommandError("Authentication email worker unavailable; job remains pending.") from None
                self.stderr.write("Authentication email worker unavailable; retrying.")
                processed = False
            if options["once"]:
                self.stdout.write("Processed one request." if processed else "No pending requests processed.")
                return
            if not processed:
                time.sleep(max(1, options["sleep"]))
