"""Future startup probe: only a random, short-lived cache health key is touched."""
import secrets

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError

from accounts.auth_infrastructure import shared_security_cache_configured


class Command(BaseCommand):
    help = "Verify configured shared Redis connectivity using two independent clients; never touches account data."

    def handle(self, *args, **options):
        if not shared_security_cache_configured():
            raise CommandError("A shared Redis primary is required for production authentication.")
        from redis import Redis
        location = settings.CACHES["default"]["LOCATION"]
        tls = {"ssl_cert_reqs": "required", "ssl_check_hostname": True} if location.startswith("rediss://") else {}
        clients = [Redis.from_url(location, socket_connect_timeout=2, socket_timeout=2, **tls) for _ in range(2)]
        key = "bharath-auth-health:" + secrets.token_hex(24)
        created = False
        try:
            created = clients[0].set(key, 0, nx=True, ex=30)
            if not created or clients[0].incr(key) != 1 or clients[1].incr(key) != 2 or clients[0].get(key) != b"2":
                raise ValueError()
        except Exception:
            raise CommandError("Shared security cache is unavailable or failed its atomic counter probe.") from None
        finally:
            if created:
                try:
                    clients[0].delete(key)
                except Exception:
                    pass  # Probe has a 30-second expiry; never clear unrelated keys.
            for client in clients:
                client.close()
        self.stdout.write("PASS shared Redis connectivity and independent-client atomic counter probe.")
