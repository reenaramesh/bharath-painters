from types import SimpleNamespace
from unittest.mock import patch
from django.test import SimpleTestCase
from accounts.views import _contractor_digital_card


class ProfileBusinessPresentationTests(SimpleTestCase):
    def card(self, published=False, owner=False):
        collection=lambda items:SimpleNamespace(all=lambda:items)
        provider=SimpleNamespace(is_published=published, about='We prepare and paint interiors.', headline='Interior painting team', brand_snapshot={}, resolved_branding=lambda:{}, core_service=SimpleNamespace(name='Painting'), additional_services=collection([SimpleNamespace(name='Waterproofing')]), service_claims=collection([SimpleNamespace(is_active=True,work_description=SimpleNamespace(name='Texture finish')),SimpleNamespace(is_active=False,work_description=SimpleNamespace(name='Inactive service'))]), service_areas='Whitefield',base_location='Bengaluru')
        profile=SimpleNamespace(company_name='Sample Company',owner_name='Owner',company_logo_position={},company_logo=None,profile_background=None,profile_background_position={},years_in_business=8,number_of_painters=4,service_areas='Whitefield',work_skills='Interior painting',office_address='Bengaluru office',completed_projects=collection([]))
        user=SimpleNamespace(contractor_profile=profile,profile_photo_position={},profile_photo=None,bharath_id='BP-C-DEMO',is_verified=True,verification_status='VERIFIED',mobile='9999999999',email='')
        with patch('accounts.views.ProviderProfile.objects') as manager,patch('accounts.views._customer_review_data',return_value={}),patch('accounts.views._contractor_social_links',return_value=[]):
            manager.filter.return_value.select_related.return_value.first.return_value=provider
            return _contractor_digital_card(user,None,include_draft=owner)

    def test_published_about_services_and_office_are_present(self):
        card=self.card(published=True)
        self.assertEqual(card['about'],'We prepare and paint interiors.')
        self.assertEqual(card['services'],['Painting','Waterproofing','Texture finish'])
        self.assertEqual(card['office_address'],'Bengaluru office')

    def test_draft_about_is_owner_only(self):
        self.assertEqual(self.card()['about'],'')
        self.assertEqual(self.card(owner=True)['about'],'We prepare and paint interiors.')
