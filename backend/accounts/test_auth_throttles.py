"""Auth IP limits trust forwarding headers only from configured proxy networks."""
from types import SimpleNamespace

from django.core.cache import cache
from django.test import SimpleTestCase, override_settings
from rest_framework.request import Request
from rest_framework.test import APIRequestFactory
from rest_framework.throttling import ScopedRateThrottle

from . import auth_email_security


AUTH_SCOPES = ("login", "registration", "recovery_lookup", "recovery_request",
               "recovery_verify", "password_confirm")


@override_settings(AUTH_TRUSTED_PROXY_CIDRS=[])
class AuthProxyThrottleTests(SimpleTestCase):
    def setUp(self):
        cache.clear()
        self.factory = APIRequestFactory()

    def throttle(self, scope="login"):
        # Falling back verifies the vulnerable existing behavior before the fix.
        base = getattr(auth_email_security, "AuthScopedRateThrottle", ScopedRateThrottle)
        return type("SingleRequestThrottle", (base,), {"THROTTLE_RATES": {scope: "1/minute"}})()

    def request(self, peer="198.51.100.10", forwarded=None):
        headers = {"REMOTE_ADDR": peer}
        if forwarded is not None:
            headers["HTTP_X_FORWARDED_FOR"] = forwarded
        return Request(self.factory.post("/auth/", {}, format="json", **headers), authenticators=[])

    def allowed(self, request, scope="login"):
        return self.throttle(scope).allow_request(request, SimpleNamespace(throttle_scope=scope))

    def test_rotating_untrusted_forwarding_header_cannot_bypass_any_auth_scope(self):
        for scope in AUTH_SCOPES:
            with self.subTest(scope=scope):
                cache.clear()
                self.assertTrue(self.allowed(self.request(forwarded="203.0.113.1"), scope))
                self.assertFalse(self.allowed(self.request(forwarded="203.0.113.2"), scope))

    @override_settings(AUTH_TRUSTED_PROXY_CIDRS=["10.0.0.0/8"])
    def test_trusted_proxy_keeps_different_clients_in_separate_buckets(self):
        self.assertTrue(self.allowed(self.request("10.0.0.2", "198.51.100.1")))
        self.assertTrue(self.allowed(self.request("10.0.0.2", "198.51.100.2")))
        self.assertFalse(self.allowed(self.request("10.0.0.2", "198.51.100.1")))

    @override_settings(AUTH_TRUSTED_PROXY_CIDRS=["10.0.0.0/8"])
    def test_untrusted_peer_cannot_use_forwarded_headers_even_when_proxies_configured(self):
        self.assertEqual(self.throttle().get_ident(self.request(forwarded="10.0.0.2")), "198.51.100.10")

    @override_settings(AUTH_TRUSTED_PROXY_CIDRS=["10.0.0.0/8"])
    def test_walk_stops_at_first_untrusted_hop_and_ignores_forged_prefix(self):
        first = self.request("10.0.0.2", "203.0.113.1, 198.51.100.10, 10.1.1.1")
        second = self.request("10.0.0.2", "203.0.113.2, 198.51.100.10, 10.1.1.1")
        self.assertEqual(self.throttle().get_ident(first), "198.51.100.10")
        self.assertTrue(self.allowed(first))
        self.assertFalse(self.allowed(second))

    @override_settings(AUTH_TRUSTED_PROXY_CIDRS=["2001:db8:feed::/48"])
    def test_ipv6_addresses_are_canonicalized(self):
        first = self.request("2001:db8:feed::1", "2001:db8:1234:0:0:0:0:1")
        second = self.request("2001:db8:feed::1", "2001:db8:1234::1")
        self.assertEqual(self.throttle().get_ident(first), "2001:db8:1234::1")
        self.assertTrue(self.allowed(first))
        self.assertFalse(self.allowed(second))

    @override_settings(AUTH_TRUSTED_PROXY_CIDRS=["10.0.0.0/8"])
    def test_missing_or_malformed_forwarded_chain_falls_back_to_peer(self):
        for value in (None, "", "bad-ip", "198.51.100.1, bad-ip", ",198.51.100.1"):
            with self.subTest(value=value):
                self.assertEqual(self.throttle().get_ident(self.request("10.0.0.2", value)), "10.0.0.2")

    def test_invalid_proxy_configuration_never_trusts_forwarded_headers(self):
        for value in (["bad-network"], ["10.0.0.0/8", "bad-network"], "10.0.0.0/8", None):
            with self.subTest(value=value), override_settings(AUTH_TRUSTED_PROXY_CIDRS=value):
                self.assertEqual(self.throttle().get_ident(self.request("10.0.0.2", "198.51.100.1")), "10.0.0.2")

    def test_missing_or_invalid_peer_uses_one_conservative_bucket(self):
        for value in ("", "invalid-peer"):
            with self.subTest(value=value):
                self.assertEqual(self.throttle().get_ident(self.request(value, "198.51.100.1")), "unknown-peer")
