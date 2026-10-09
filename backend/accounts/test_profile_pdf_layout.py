from io import BytesIO
from types import SimpleNamespace
from django.test import SimpleTestCase
from PIL import Image
import pymupdf
import re
from accounts.profile_card_pdf import render_contractor_card_pdf
from quotations.indic_pdf import profile_pdf
from quotations.transliteration import system_text

class MemoryImage(BytesIO):
    name = 'profile.png'
    def open(self, mode='rb'):
        self.seek(0)
        return self
    def close(self):
        self.seek(0)

class ProfilePdfLayoutTests(SimpleTestCase):
    def fixture(self):
        def image(color):
            buf=BytesIO(); Image.new('RGB',(30,30),color).save(buf,format='PNG');return MemoryImage(buf.getvalue())
        project={'id':1,'title':'Sample project','apartment_community':'Sample community','location':'Sample location','address':'123 Sample Road','pincode':'560001','description':'Original custom description','work_completed':'Original custom work','completed_on_display':'08 Oct 2026'}
        collection=SimpleNamespace(filter=lambda **kwargs: SimpleNamespace(first=lambda:SimpleNamespace(photo=image('orange'))))
        user=SimpleNamespace(bharath_id='BP-C-TEST',profile_photo=image('green'),bharath_qr=image('blue'),contractor_profile=SimpleNamespace(company_logo=image('red'),completed_projects=collection))
        card={'bharath_id':user.bharath_id,'title':'Sample Company','owner_name':'Sample Owner','mobile':'9876543210','email':'owner@example.com','service_areas':['Sample Town'],'work_skills':['Custom skill'],'years_in_business':3,'workers':4,'projects':[project],'social_links':[],'customer_reviews':{'items':[],'rating':0,'count':0}}
        return user,card

    def test_language_selection_preserves_current_profile_geometry_and_images(self):
        user,card=self.fixture()
        with pymupdf.open(stream=render_contractor_card_pdf(user,card,'https://example.com/profile'),filetype='pdf') as original:
            for language in ['kn','te','hi','ta']:
                with self.subTest(language=language), pymupdf.open(stream=profile_pdf(user,card,'https://example.com/profile',language),filetype='pdf') as localized:
                    self.assertEqual(len(localized),len(original))
                    for source,result in zip(original,localized):
                        self.assertEqual(result.rect,source.rect)
                        self.assertEqual([{k:v for k,v in item.items() if k!='seqno'} for item in result.get_drawings()],[{k:v for k,v in item.items() if k!='seqno'} for item in source.get_drawings()])
                        self.assertEqual([(v['bbox'],v['digest']) for v in result.get_image_info(hashes=True)],[(v['bbox'],v['digest']) for v in source.get_image_info(hashes=True)])
                    content=''.join(page.get_text() for page in localized)
                    logical_text = ''.join(bytes.fromhex(value.decode()).decode('utf-16') for page in localized for stream in page.get_contents() for value in re.findall(rb'/ActualText <([0-9a-f]+)>', localized.xref_stream(stream)))
                    self.assertIn(system_text('About the work',language),logical_text)
                    for value in ['Sample Company','Sample Owner','9876543210','owner@example.com','BP-C-TEST','Original custom description','https://example.com/profile']:
                        self.assertIn(value,content)
