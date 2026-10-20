from django.urls import reverse
from django.utils import timezone
from .test_customer_share_links import CustomerShareLinkTests
from .models import Customer, ContractorCustomerConnection


class CustomerActivationStatusTests(CustomerShareLinkTests):
    def test_status_changes_only_when_account_activated(self):
        created = self.create_customer()
        customer = Customer.objects.get(pk=created.data['id'])
        url = reverse('customer-detail', args=[customer.pk])
        self.assertEqual(self.client.get(url).data['account_status'], 'NOT_ACTIVATED')
        for _ in range(3):
            self.assertEqual(self.client.post(reverse('customer-share-link-create', args=[customer.pk])).status_code, 200)
        self.assertEqual(self.client.get(url).data['account_status'], 'NOT_ACTIVATED')
        customer.portal_user.set_password('BetterPass123!')
        customer.portal_user.last_activity_at = timezone.now()
        customer.portal_user.save(update_fields=['password', 'last_activity_at'])
        data = self.client.get(url).data
        self.assertEqual(data['account_status'], 'ACTIVE')
        self.assertTrue(data['has_app_activity'])
        self.assertEqual(self.client.post(reverse('customer-share-link-create', args=[customer.pk])).status_code, 409)
        customer.portal_user.is_active = False
        customer.portal_user.save(update_fields=['is_active'])
        self.assertEqual(self.client.get(url).data['account_status'], 'DISABLED')
        self.assertEqual(self.client.post(reverse('customer-share-link-create', args=[customer.pk])).status_code, 409)

    def test_unrelated_contractor_cannot_resend_or_read_account_activity(self):
        customer = Customer.objects.get(pk=self.create_customer().data['id'])
        self.other.role = 'CONTRACTOR'
        self.other.save(update_fields=['role'])
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.post(reverse('customer-share-link-create', args=[customer.pk])).status_code, 404)
        ContractorCustomerConnection.objects.create(customer=customer, contractor=self.other)
        data = self.client.get(reverse('customer-detail', args=[customer.pk])).data
        self.assertNotIn('account_status', data)
        self.assertNotIn('has_app_activity', data)
