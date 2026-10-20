from types import SimpleNamespace
from unittest.mock import patch
from tempfile import TemporaryDirectory
from django.test import SimpleTestCase, override_settings
from rest_framework.test import APITestCase
from accounts.legal import POLICY_VERSION
from accounts.views import _registration_consent_error, _record_registration_consent

class LinkedRegistrationConsentTests(SimpleTestCase):
    def request(self, **changes):
        data = dict(policy_version=POLICY_VERSION, acceptance_method='REGISTRATION_SUBMIT', terms_accepted=True, privacy_notice_acknowledged=True)
        data.update(changes)
        return SimpleNamespace(data=data, META={})

    def test_submission_acceptance_does_not_require_or_claim_scrolling(self):
        request = self.request()
        self.assertIsNone(_registration_consent_error(request))
        with patch('accounts.views.UserLegalConsent.objects.update_or_create') as save:
            _record_registration_consent(SimpleNamespace(pk=1), request, 'CUSTOMER')
        evidence = save.call_args.kwargs['defaults']
        self.assertEqual(evidence['acceptance_method'], 'REGISTRATION_SUBMIT')
        self.assertFalse(evidence['document_scrolled'])

    def test_current_policy_and_both_acceptances_remain_required(self):
        for changes in ({'policy_version': 'old'}, {'terms_accepted': False}, {'privacy_notice_acknowledged': False}, {'acceptance_method': 'anything'}):
            with self.subTest(changes=changes):
                self.assertIsNotNone(_registration_consent_error(self.request(**changes)))

    def test_non_string_acceptance_methods_are_rejected(self):
        for method in ([], {}, ["REGISTRATION_SUBMIT"], {"method": "REGISTRATION_SUBMIT"}, 1, True):
            with self.subTest(method=method):
                error = _registration_consent_error(self.request(acceptance_method=method))
                self.assertIn("acceptance_method", error)

    def test_legacy_clients_keep_scroll_requirement(self):
        self.assertIsNone(_registration_consent_error(self.request(acceptance_method='', document_scrolled=True)))
        self.assertIsNotNone(_registration_consent_error(self.request(acceptance_method='', document_scrolled=False)))

class LinkedSignupEndpointTests(APITestCase):
    def setUp(self):
        media = TemporaryDirectory()
        self.addCleanup(media.cleanup)
        settings = override_settings(MEDIA_ROOT=media.name)
        settings.enable()
        self.addCleanup(settings.disable)

    def test_known_mobile_cannot_claim_existing_customer_or_placeholder(self):
        from accounts.models import BharathUser
        from quotations.models import Customer
        from django.urls import reverse
        for has_placeholder in (False, True):
            with self.subTest(has_placeholder=has_placeholder):
                mobile = '9888877720' if has_placeholder else '9888877721'
                placeholder = BharathUser.objects.create_user(mobile=mobile, role='CUSTOMER') if has_placeholder else None
                customer = Customer.objects.create(name='Existing private customer', mobile=mobile, portal_user=placeholder)
                response = self.client.post(reverse('register-customer'), {
                    'name': 'Mobile claimant', 'mobile': mobile, 'password': 'customer-pass',
                    'policy_version': POLICY_VERSION, 'acceptance_method': 'REGISTRATION_SUBMIT',
                    'terms_accepted': True, 'privacy_notice_acknowledged': True,
                }, format='json')
                self.assertEqual(response.status_code, 409, response.data)
                customer.refresh_from_db()
                self.assertEqual(customer.portal_user_id, placeholder.pk if placeholder else None)
                if placeholder:
                    placeholder.refresh_from_db()
                    self.assertFalse(placeholder.has_usable_password())

    def test_customer_submit_records_truthful_evidence(self):
        from accounts.models import BharathUser, UserLegalConsent
        from django.urls import reverse
        response = self.client.post(reverse('register-customer'), {
            'name': 'Linked terms customer', 'mobile': '9888877719',
            'email': 'linked.terms@example.com', 'password': 'customer-pass',
            'policy_version': POLICY_VERSION, 'acceptance_method': 'REGISTRATION_SUBMIT',
            'terms_accepted': True, 'privacy_notice_acknowledged': True,
        }, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        user = BharathUser.objects.get(email='linked.terms@example.com')
        consent = UserLegalConsent.objects.get(user=user, policy_version=POLICY_VERSION)
        self.assertEqual(consent.acceptance_method, 'REGISTRATION_SUBMIT')
        self.assertFalse(consent.document_scrolled)
        self.assertTrue(consent.terms_accepted)
        self.assertTrue(consent.privacy_notice_acknowledged)
