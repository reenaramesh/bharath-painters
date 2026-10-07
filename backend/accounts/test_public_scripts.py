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
                    self.assertIn('name="document_language"', html)
                    self.assertIn('https://example.com/BP-SAVE-1/pdf/', html)
                    if script == 'te': self.assertIn('డౌన్‌లోడ్ PDF', html)
                if name == 'painter_card': self.assertIn('Customer Save', html)

    def test_unsupported_public_script_falls_back_to_english(self):
        request = RequestFactory().get('/verify-page/BP-SAVE-1/', {'document_language':'unknown'})
        html = render_to_string('accounts/verify.html', {'verified':False, 'bharath_id':'BP-SAVE-1', 'request':request})
        self.assertIn('lang="en"', html)
