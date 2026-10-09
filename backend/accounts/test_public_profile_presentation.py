import json
import re

from django.template.loader import render_to_string
from django.test import SimpleTestCase


class PublicProfilePresentationTests(SimpleTestCase):
    def test_embedded_profile_uses_only_public_card_and_escapes_script_content(self):
        card = {
            'title': 'Company </script><script>alert(1)</script>',
            'bharath_id': 'BP-C-DEMO',
            'verified': True,
            'projects': [{'id': 1, 'title': 'Completed work'}],
            'service_areas': ['Bengaluru'],
            'work_skills': ['Painting'],
        }
        html = render_to_string('accounts/digital_card.html', {
            'card': card,
            'qr_image': '/media/demo-qr.png',
            'profile_url': '/api/accounts/verify-page/BP-C-DEMO/',
            'pdf_url': '/api/accounts/profile-card/BP-C-DEMO/pdf/',
            'private_account': {'password': 'PRIVATE-MARKER', 'bank_account': 'PRIVATE-BANK'},
        })
        match = re.search(r'<script id="contractor-profile-data" type="application/json">(.*?)</script>', html, re.S)
        self.assertIsNotNone(match)
        self.assertEqual(json.loads(match.group(1)), card)
        self.assertNotIn('<script>', match.group(1))
        self.assertNotIn('PRIVATE-MARKER', html)
        self.assertNotIn('PRIVATE-BANK', html)
        for name in ('qr', 'url', 'pdf'):
            self.assertIn(f'id="contractor-profile-{name}"', html)
