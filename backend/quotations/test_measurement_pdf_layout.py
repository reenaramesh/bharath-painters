from django.test import TestCase
from pypdf import PdfReader
from accounts.models import BharathUser
from .models import Customer, Property, PropertyRoom, MeasurementSurface, MeasurementOpening
from .professional_pdf import build_measurement_pdf


class MeasurementPdfLayoutTests(TestCase):
    def setUp(self):
        contractor = BharathUser.objects.create_user(mobile='9000088881', password='test', role='CONTRACTOR')
        customer = Customer.objects.create(name='Test Customer', mobile='9000088882', contractor=contractor)
        self.property = Property.objects.create(customer=customer, contractor=contractor, name='Common room layout')

    def add_surface(self, room, kind, name, length, breadth, group=''):
        return MeasurementSurface.objects.create(property=self.property, room=room, work_area='INTERIOR',
            surface_type=kind, name=name, length=length, breadth=breadth, area_group_name=group)

    def text(self):
        pdf = build_measurement_pdf(self.property)
        return '\n'.join(page.extract_text() for page in PdfReader(pdf).pages)

    def test_all_measured_rooms_share_one_table_and_unused_cards_are_hidden(self):
        bedroom = PropertyRoom.objects.create(property=self.property, name='Bedroom')
        balcony = PropertyRoom.objects.create(property=self.property, name='Balcony')
        self.add_surface(bedroom, 'WALL', 'Wall 1', 10, 8)
        self.add_surface(balcony, 'CEILING', 'Ceiling 1', 5, 4)
        self.add_surface(balcony, 'OTHER', 'Table 1', 2, 3, 'Table')
        self.add_surface(bedroom, 'DOOR', 'Empty door', 0, 0)
        text = self.text()
        self.assertIn('ALL ROOM MEASUREMENTS', text)
        self.assertIn('Bedroom', text)
        self.assertIn('Balcony', text)
        self.assertIn('Table', text)
        self.assertNotIn('WINDOW QTY', text)
        self.assertNotIn('DOOR QTY', text)
        self.assertNotIn('Empty door', text)
        self.assertEqual(text.count('ALL ROOMS TOTAL'), 1)
        self.assertIn('106 sq.ft', text)

    def test_actual_door_and_window_cards_remain_when_measured(self):
        room = PropertyRoom.objects.create(property=self.property, name='Living room')
        self.add_surface(room, 'DOOR', 'Door 1', 7, 3)
        self.add_surface(room, 'WINDOW', 'Window 1', 4, 3)
        text = self.text()
        self.assertIn('DOOR QTY', text)
        self.assertIn('WINDOW QTY', text)

    def test_reference_only_opening_is_kept_in_room_and_detail_tables(self):
        room = PropertyRoom.objects.create(property=self.property, name='Reference Balcony')
        carrier = self.add_surface(room, 'WALL', '__ROOM_ADJUSTMENTS__', 0, 0)
        MeasurementOpening.objects.create(surface=carrier, opening_type='DOOR', name='Reference door',
            width=3, height=7, deduction_mode='IGNORE')
        text = self.text()
        self.assertIn('Reference Balcony', text)
        self.assertIn('Reference door', ' '.join(text.split()))
        self.assertIn('Reference', text)
        self.assertIn('DOOR QTY', text)

    def test_addition_only_category_is_visible_with_correct_net(self):
        room = PropertyRoom.objects.create(property=self.property, name='Addition Balcony')
        carrier = self.add_surface(room, 'CEILING', '__ROOM_ADJUSTMENTS__', 0, 0)
        MeasurementOpening.objects.create(surface=carrier, opening_type='OTHER', name='Ceiling addition',
            width=3, height=7, effect='ADD')
        text = self.text()
        summary = text.split('ALL ROOM MEASUREMENTS')[1].split('AREA CALCULATION DETAILS')[0]
        self.assertIn('Ceilings', summary)
        self.assertIn('21 sq.ft', summary)
