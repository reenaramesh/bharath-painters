"""Print a VAPID key pair for backend environment variables."""

import base64

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = "Generate a Web Push VAPID key pair. Store the private key in backend environment variables."

    def handle(self, *args, **options):
        private = ec.generate_private_key(ec.SECP256R1())
        private_der = private.private_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        public_point = private.public_key().public_bytes(
            encoding=serialization.Encoding.X962,
            format=serialization.PublicFormat.UncompressedPoint,
        )
        self.stdout.write("WEB_PUSH_VAPID_PUBLIC_KEY=" + base64.urlsafe_b64encode(public_point).rstrip(b"=").decode("ascii"))
        self.stdout.write("WEB_PUSH_VAPID_PRIVATE_KEY=" + base64.urlsafe_b64encode(private_der).rstrip(b"=").decode("ascii"))
        self.stdout.write("WEB_PUSH_VAPID_SUBJECT=mailto:support@bharathpainters.in")
