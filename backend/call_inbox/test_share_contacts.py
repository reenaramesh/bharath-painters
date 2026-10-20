from rest_framework.test import APITestCase
from accounts.models import BharathUser
from quotations.models import Customer, SavedCustomerContact, ContractorCustomerConnection


class ShareContactTests(APITestCase):
    def setUp(self):
        self.owner = BharathUser.objects.create_user(mobile='9876543210', password='test', role='CONTRACTOR')
        self.other = BharathUser.objects.create_user(mobile='9876543211', password='test', role='CONTRACTOR')
        self.client.force_authenticate(self.owner)

    def customer(self, **extra):
        return self.client.post('/api/quotations/customers/', {
            'name': 'Shared Name', 'mobile': '9876543212', 'notes': 'Follow up',
            'contact_only': True, **extra,
        }, format='json')

    def test_customer_import_does_not_activate_or_connect(self):
        response = self.customer()
        self.assertEqual(response.status_code, 201, response.data)
        customer = Customer.objects.get(pk=response.data['id'])
        self.assertIsNone(customer.portal_user_id)
        self.assertEqual(BharathUser.objects.count(), 2)
        self.assertFalse(ContractorCustomerConnection.objects.exists())
        self.assertEqual(SavedCustomerContact.objects.get().details['notes'], 'Follow up')

    def test_customer_duplicate_is_returned_without_overwriting(self):
        first = self.customer()
        second = self.customer(name='Changed')
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.data['already_saved'])
        self.assertEqual(first.data['id'], second.data['id'])
        self.assertEqual(SavedCustomerContact.objects.get().details['name'], 'Shared Name')

    def test_painter_contact_is_scoped_and_has_no_account(self):
        payload = {'name': 'Painter Name', 'mobile': '9876543212', 'remarks': 'Call tomorrow'}
        first = self.client.post('/api/accounts/painter-contacts/', payload, format='json')
        self.assertEqual(first.status_code, 201, first.data)
        self.assertEqual(first.data['mobile'], '+919876543212')
        self.assertFalse(first.data['verified'])
        second = self.client.post('/api/accounts/painter-contacts/', payload, format='json')
        self.assertEqual(second.status_code, 200)
        self.assertTrue(second.data['already_saved'])
        self.assertEqual(BharathUser.objects.count(), 2)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(f"/api/accounts/painter-contacts/{first.data['id']}/").status_code, 404)
        self.assertEqual(self.client.get('/api/accounts/painter-contacts/').data, [])

    def lookup(self, category='Customer', mobile='9876543212'):
        return self.client.get('/api/call-inbox/shared-contact-lookup/', {'category': category, 'mobile': mobile})

    def test_lookup_is_category_specific_even_with_same_number_in_both(self):
        customer = self.customer()
        self.assertIsNone(self.lookup('Painter').data['existing_url'])
        painter = self.client.post('/api/accounts/painter-contacts/', {'name': 'Painter', 'mobile': '9876543212'}, format='json')
        self.assertEqual(self.lookup('Customer').data['existing_url'], f"/customers/{customer.data['id']}")
        self.assertEqual(self.lookup('Painter').data['existing_url'], f"/painters/contacts/{painter.data['id']}")
        self.client.force_authenticate(self.other)
        self.assertIsNone(self.lookup('Customer').data['existing_url'])
        self.assertIsNone(self.lookup('Painter').data['existing_url'])

    def test_other_contractors_customer_identity_is_not_disclosed_or_changed(self):
        self.customer()
        self.client.force_authenticate(self.other)
        response = self.customer(name='My own name', notes='Private note')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(Customer.objects.count(), 1)
        self.assertEqual(response.data['name'], 'My own name')
        self.assertEqual(SavedCustomerContact.objects.get(contractor=self.owner).details['notes'], 'Follow up')
        detail = self.client.get(f"/api/quotations/customers/{response.data['id']}/")
        self.assertEqual(detail.data['name'], 'My own name')
        self.assertFalse(ContractorCustomerConnection.objects.exists())
        self.assertEqual(BharathUser.objects.count(), 2)

    def test_missing_name_and_invalid_mobile_do_not_create_records(self):
        for payload in ({'name': '', 'mobile': '9876543212'}, {'name': 'Name', 'mobile': '123'}):
            self.assertEqual(self.customer(**payload).status_code, 400)
            self.assertEqual(self.client.post('/api/accounts/painter-contacts/', payload, format='json').status_code, 400)
        self.assertFalse(Customer.objects.exists())
        self.assertEqual(self.lookup(category='').status_code, 400)
        self.assertEqual(self.lookup(mobile='123').status_code, 400)

    def test_unauthenticated_and_noncontractor_users_are_denied(self):
        for user in (None, BharathUser.objects.create_user(mobile='9876543214', password='test', role='CUSTOMER')):
            self.client.force_authenticate(user)
            self.assertIn(self.customer().status_code, (401, 403))
            self.assertIn(self.lookup().status_code, (401, 403))
            self.assertIn(self.client.post('/api/accounts/painter-contacts/', {'name': 'Name', 'mobile': '9876543212'}, format='json').status_code, (401, 403))

    def test_existing_painter_profile_can_be_reused_without_verifying_import(self):
        from accounts.models import PainterProfile, PainterContact
        user = BharathUser.objects.create_user(mobile='9876543212', password='test', role='PAINTER')
        profile = PainterProfile.objects.create(user=user)
        response = self.client.post('/api/accounts/painter-contacts/', {'name': 'Imported', 'mobile': '9876543212'}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(PainterContact.objects.get().profile, profile)
        self.assertFalse(response.data['verified'])
        user.refresh_from_db()
        self.assertFalse(user.is_verified)
        # The same number may also be a customer contact, without another login.
        self.assertEqual(self.customer().status_code, 201)
        self.assertEqual(BharathUser.objects.count(), 3)

    def test_directory_profile_is_saved_in_owned_painter_module_without_new_account(self):
        from accounts.models import PainterProfile, PainterContact
        user = BharathUser.objects.create_user(mobile='9876543212', password='test', role='PAINTER', is_verified=True, verification_status='VERIFIED')
        PainterProfile.objects.create(user=user)
        self.assertIsNone(self.lookup('Painter').data['existing_url'])
        response = self.client.post('/api/accounts/painter-contacts/', {'name': 'Shared Name', 'mobile': '9876543212'}, format='json')
        self.assertEqual(response.status_code, 201)
        contact = PainterContact.objects.get(contractor=self.owner)
        self.assertEqual(contact.profile.user_id, user.pk)
        self.assertFalse(response.data['verified'])
        self.assertEqual(self.lookup('Painter').data['existing_url'], f'/painters/contacts/{contact.pk}')
        self.assertEqual(len(self.client.get('/api/accounts/painter-contacts/').data), 1)
        self.assertEqual(BharathUser.objects.count(), 3)

    def test_pending_customer_is_a_duplicate_without_approval_changes(self):
        customer = Customer.objects.create(contractor=self.other, name='Pending', mobile='9876543212')
        connection = ContractorCustomerConnection.objects.create(customer=customer, contractor=self.owner)
        self.assertEqual(self.lookup().data['existing_url'], f'/customers/{customer.pk}')
        self.assertTrue(self.customer().data['already_saved'])
        connection.refresh_from_db()
        self.assertEqual(connection.status, 'PENDING')
        self.assertEqual(BharathUser.objects.count(), 2)
