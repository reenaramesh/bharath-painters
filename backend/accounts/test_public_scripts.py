from django.test import SimpleTestCase, RequestFactory, override_settings
from django.template.loader import render_to_string


@override_settings(STORAGES={'default':{'BACKEND':'django.core.files.storage.FileSystemStorage'},'staticfiles':{'BACKEND':'django.contrib.staticfiles.storage.StaticFilesStorage'}})
class PublicScriptTests(SimpleTestCase):
    def test_public_templates_preserve_names_and_use_native_system_copy(self):
        card = {'title':'Save Painting Company', 'owner_name':'Customer Save', 'profession_label':'Contractor', 'service_areas':['Painting Road'],
            'work_skills':['Painting'], 'projects':[], 'platform_name':'Bharath Apps', 'owner_photo_position':{}, 'logo_position':{}, 'social_links':[]}
        for script in ('en','te','kn','hi','ta'):
            request = RequestFactory().get('/verify-page/BP-SAVE-1/', {'document_language':script})
            for name in ('digital_card', 'painter_card', 'verify'):
                html = render_to_string(f'accounts/{name}.html', {'card':card, 'name':'Customer Save', 'bharath_id':'BP-SAVE-1', 'verified':False,
                    'pdf_url':'https://example.com/BP-SAVE-1/pdf/', 'request':request})
                self.assertNotIn('{% system_copy', html)
                self.assertNotIn('{% js_copy', html)
                self.assertIn('BP-SAVE-1', html)
                if name == 'digital_card':
                    self.assertIn('Save Painting Company', html)
                    self.assertIn('Customer Save', html)
                    self.assertNotIn('<select', html)
                    self.assertNotIn('public-pdf-script', html)
                    self.assertIn('https://example.com/BP-SAVE-1/pdf/', html)
                    if script == 'te': self.assertIn('డౌన్‌లోడ్ PDF', html)
                if name == 'painter_card': self.assertIn('Customer Save', html)

    def test_unsupported_public_script_falls_back_to_english(self):
        request = RequestFactory().get('/verify-page/BP-SAVE-1/', {'document_language':'unknown'})
        html = render_to_string('accounts/verify.html', {'verified':False, 'bharath_id':'BP-SAVE-1', 'request':request})
        self.assertIn('lang="en"', html)

    def test_shared_contractor_card_keeps_images_in_banner_and_actions_by_name(self):
        card = {'title': 'Public Company', 'owner_name': 'Owner', 'bharath_id': 'BP-C-1',
                'owner_photo': '/owner.png', 'logo': '/logo.png', 'projects': [],
                'owner_photo_position': {}, 'logo_position': {}}
        html = render_to_string('accounts/digital_card.html', {'card': card, 'qr_image': '/qr.png', 'pdf_url': '/card.pdf'})
        cover = html.split('<div class="cover">', 1)[1].split('<div class="identity">', 1)[0]
        for image in ('/owner.png', '/logo.png', '/qr.png'):
            self.assertIn(image, cover)
        self.assertIn('class="brand"', cover)
        self.assertIn('class="profile-details"', html)
        self.assertNotIn('<select', html)
