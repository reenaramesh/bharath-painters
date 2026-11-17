"""Offline infrastructure guards; never opens hosted connections or sends mail."""
from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from django.core.checks import run_checks
from rest_framework.exceptions import APIException
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory

from . import checks, email_setup
from .auth_email_security import AuthScopedRateThrottle, RecoveryIdentityCooldown

REDIS_CACHE = {"default": {"BACKEND": "django.core.cache.backends.redis.RedisCache", "LOCATION": "redis://127.0.0.1:16379/0"}}


@override_settings(DEBUG=False)
class ProductionSecurityInfrastructureTests(SimpleTestCase):
    def deployment_ids(self):
        return [item.id for item in run_checks(tags=["security"], include_deployment_checks=True)]

    def test_insecure_transport_settings_are_deployment_errors(self):
        for field, value in (("SECURE_SSL_REDIRECT", False), ("SESSION_COOKIE_SECURE", False),
                             ("CSRF_COOKIE_SECURE", False), ("SECURE_PROXY_SSL_HEADER", None),
                             ("ALLOWED_HOSTS", ["*"]), ("AUTH_TRUSTED_PROXY_CIDRS", ["0.0.0.0/0"])):
            with self.subTest(field=field), override_settings(**{field: value}):
                self.assertIn("accounts.E010", self.deployment_ids())

    @override_settings(CORS_ALLOWED_ORIGINS=["http://localhost:5173"])
    def test_production_rejects_other_insecure_trusted_origins(self):
        self.assertIn("accounts.E010", self.deployment_ids())

    @override_settings(PASSWORD_RECOVERY_DELIVERY_MODE="sync")
    def test_production_synchronous_recovery_cannot_be_enabled(self):
        self.assertIn("accounts.E012", self.deployment_ids())

    @override_settings(DATABASES={"default": {"ENGINE": "django.db.backends.sqlite3"}})
    def test_sqlite_production_database_is_a_deployment_error(self):
        self.assertIn("accounts.E011", self.deployment_ids())
    @override_settings(ALLOW_SINGLE_INSTANCE_AUTH_CACHE=False)
    def test_process_local_and_file_caches_are_deployment_errors(self):
        for backend in ("locmem.LocMemCache", "filebased.FileBasedCache", "dummy.DummyCache", "db.DatabaseCache"):
            with override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends." + backend}}):
                self.assertIn("accounts.E009", [item.id for item in checks.production_shared_cache_check(None)])

    @override_settings(ALLOW_SINGLE_INSTANCE_AUTH_CACHE=True, CACHES={"default": {"BACKEND": "django.core.cache.backends.locmem.LocMemCache"}})
    def test_single_instance_locmem_cache_warns_instead_of_error_and_allows_throttle(self):
        messages = checks.production_shared_cache_check(None)
        self.assertFalse(any(item.level >= 40 for item in messages), messages)
        self.assertIn("accounts.W005", [item.id for item in messages])
        throttle = AuthScopedRateThrottle()
        self.assertTrue(throttle.allow_request(self.request(), SimpleNamespace(throttle_scope="login")))

    @override_settings(CACHES=REDIS_CACHE)
    def test_one_redis_primary_passes_configuration_check_without_connecting(self):
        self.assertEqual(checks.production_shared_cache_check(None), [])

    def test_redis_tls_verification_cannot_be_disabled_by_url_or_options(self):
        for location, options in (("rediss://cache.example.com/0?ssl_cert_reqs=none", {}),
                                  ("rediss://cache.example.com/0", {"ssl_cert_reqs": None}),
                                  ("rediss://cache.example.com/0", {"ssl_check_hostname": False})):
            with override_settings(CACHES={"default": {"BACKEND": "django.core.cache.backends.redis.RedisCache",
                                                      "LOCATION": location, "OPTIONS": options}}):
                self.assertIn("accounts.E009", [item.id for item in checks.production_shared_cache_check(None)])

    def request(self):
        return Request(APIRequestFactory().post("/auth/", {"mobile": "9876500011"}, format="json", REMOTE_ADDR="198.51.100.1"))

    @override_settings(ALLOW_SINGLE_INSTANCE_AUTH_CACHE=False)
    def test_authentication_fails_closed_when_shared_cache_is_not_configured(self):
        throttle = AuthScopedRateThrottle()
        with self.assertRaises(APIException) as raised:
            throttle.allow_request(self.request(), SimpleNamespace(throttle_scope="login"))
        self.assertEqual(raised.exception.status_code, 503)

    @override_settings(CACHES=REDIS_CACHE)
    @patch("accounts.auth_email_security.cache")
    def test_auth_counter_is_atomic_and_uses_server_peer(self, shared):
        shared.incr.side_effect = range(1, 12)
        throttle = AuthScopedRateThrottle()
        view = SimpleNamespace(throttle_scope="login")
        self.assertTrue(all(throttle.allow_request(self.request(), view) for _ in range(10)))
        self.assertFalse(throttle.allow_request(self.request(), view))
        self.assertEqual(shared.incr.call_count, 11)
        self.assertGreater(throttle.wait(), 0)

    @override_settings(CACHES=REDIS_CACHE)
    @patch("accounts.auth_email_security.cache")
    def test_cache_failure_is_sanitized_and_never_falls_back(self, shared):
        shared.add.side_effect = ConnectionError("redis://private-user:secret-password@cache/")
        with self.assertRaises(APIException) as raised:
            AuthScopedRateThrottle().allow_request(self.request(), SimpleNamespace(throttle_scope="login"))
        self.assertEqual(raised.exception.status_code, 503)
        self.assertNotIn("secret", str(raised.exception))

    @override_settings(AUTH_EMAIL_ENABLED=False, EMAIL_PROVIDER="BREVO", BREVO_API_KEY="later-secret", BREVO_LIVE_ENABLED=True)
    @patch("accounts.email_setup.requests.post")
    @patch("accounts.email_setup.requests.get")
    def test_explicit_email_disable_prevents_provider_io_even_with_credentials(self, get, post):
        self.assertFalse(email_setup.public_email_delivery_available())
        # Avoid DB log writes in SimpleTestCase while testing the transport gate.
        with patch("accounts.email_setup.EmailDeliveryLog.objects.create"):
            self.assertFalse(email_setup.send_configured_email("Subject", "code", "fake@example.invalid", "TEST"))
        get.assert_not_called()
        post.assert_not_called()

    @override_settings(AUTH_EMAIL_ENABLED=False, EMAIL_PROVIDER="BREVO", BREVO_API_KEY="", BREVO_LIVE_ENABLED=False)
    def test_deliberately_disabled_email_can_pass_deploy_with_explicit_warning(self):
        messages = checks.production_recovery_email_delivery_check(None)
        self.assertFalse(any(item.level >= 40 for item in messages), messages)
        self.assertIn("accounts.W004", [item.id for item in messages])

    @override_settings(AUTH_EMAIL_ENABLED=False, EMAIL_PROVIDER="DJANGO", EMAIL_BACKEND="django.core.mail.backends.filebased.EmailBackend")
    def test_disabled_mode_does_not_approve_a_production_file_backend(self):
        self.assertIn("accounts.E001", [item.id for item in checks.production_recovery_email_delivery_check(None)])

    @override_settings(
        AUTH_EMAIL_ENABLED=True,
        BREVO_CONTROLLED_TEST_ENABLED=False,
        EMAIL_PROVIDER="BREVO",
        BREVO_API_KEY="later-secret-key",
        BREVO_LIVE_ENABLED=False,
        BREVO_SANDBOX=False,
        DEFAULT_FROM_EMAIL="Bharathapp <bharathapps26@gmail.com>",
    )
    def test_public_email_delivery_diagnostic_never_exposes_secrets(self):
        summary = email_setup.public_email_delivery_diagnostic()
        self.assertIn("error_code=LIVE_DELIVERY_DISABLED", summary)
        self.assertIn("brevo_key_set=True", summary)
        self.assertNotIn("later-secret-key", summary)
        self.assertNotIn("bharathapps26@gmail.com", summary)

    def test_strip_outer_quotes_handles_quoted_env_values(self):
        from config.settings import _strip_outer_quotes
        self.assertEqual(
            _strip_outer_quotes('"Bharathapp <bharathapps26@gmail.com>"'),
            "Bharathapp <bharathapps26@gmail.com>",
        )
        self.assertEqual(_strip_outer_quotes("'https://example.com/'"), "https://example.com/")
