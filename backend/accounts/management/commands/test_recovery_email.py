from django.conf import settings
from django.core.mail import send_mail
from django.core.management.base import BaseCommand, CommandError
from django.core.validators import validate_email
from django.core.exceptions import ValidationError


class Command(BaseCommand):
    help = "Send a non-sensitive test email through the configured recovery-email provider."

    def add_arguments(self, parser):
        parser.add_argument("--to", required=True, help="Recipient email address")

    def handle(self, *args, **options):
        recipient = options["to"].strip().lower()
        try:
            validate_email(recipient)
        except ValidationError as exc:
            raise CommandError("Enter a valid --to email address.") from exc
        delivered = send_mail(
            "Bharath Painters recovery email test",
            "Recovery email delivery is configured successfully. No OTP or password is included in this message.",
            settings.DEFAULT_FROM_EMAIL,
            [recipient],
            fail_silently=False,
        )
        if delivered != 1:
            raise CommandError("The email backend did not confirm delivery.")
        self.stdout.write(self.style.SUCCESS(f"Recovery email test accepted for delivery to {recipient}."))
