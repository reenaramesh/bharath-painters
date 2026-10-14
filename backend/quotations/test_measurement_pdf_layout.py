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
        self.assertIn('INTERIOR MEASUREMENTS', text)
        self.assertNotIn('ALL ROOM MEASUREMENTS', text)
        self.assertNotIn('AREA CALCULATION DETAILS', text)
        self.assertIn('Bedroom', text)
        self.assertIn('Balcony', text)
        self.assertIn('Table', text)
        self.assertNotIn('WINDOW QTY', text)
        self.assertNotIn('DOOR QTY', text)
        self.assertNotIn('Empty door', text)
        self.assertEqual(text.count('TOTAL MEASURED AREA'), 1)
        self.assertIn('106 sq.ft', text)

    def test_actual_door_and_window_cards_remain_when_measured(self):
        room = PropertyRoom.objects.create(property=self.property, name='Living room')
        self.add_surface(room, 'DOOR', 'Door 1', 7, 3)
        self.add_surface(room, 'WINDOW', 'Window 1', 4, 3)
        text = self.text()
        self.assertIn('DOOR QTY', text)
        self.assertIn('WINDOW QTY', text)

    def test_basement_ceiling_and_exterior_walls_share_property_summary(self):
        self.property.measurement_type = 'EXTERIOR'
        self.property.save(update_fields=['measurement_type'])
        basement = PropertyRoom.objects.create(property=self.property, name='Basement', painting_area='INTERIOR')
        exterior = PropertyRoom.objects.create(property=self.property, name='External walls', painting_area='EXTERIOR')
        self.add_surface(basement, 'CEILING', 'Basement ceiling', 15, 10)
        wall = self.add_surface(exterior, 'WALL', 'Exterior wall', 20, 10)
        MeasurementSurface.objects.filter(pk=wall.pk).update(work_area='EXTERIOR')
        text = self.text()
        interior = text.split('INTERIOR MEASUREMENTS')[1].split('EXTERIOR MEASUREMENTS')[0]
        exterior = text.split('EXTERIOR MEASUREMENTS')[1].split('EXTERIOR TOTAL')[0]
        self.assertIn('Basement', interior)
        self.assertNotIn('External walls', interior)
        self.assertIn('External walls', exterior)
        self.assertNotIn('Basement', exterior)
        self.assertIn('350 sq.ft', text)
        self.assertEqual(text.count('INTERIOR MEASUREMENTS'), 1)
        self.assertEqual(text.count('EXTERIOR MEASUREMENTS'), 1)

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
        interior = text.split('INTERIOR MEASUREMENTS')[1]
        self.assertIn('Ceiling addition', interior)
        self.assertIn('21 sq.ft', interior)

    def test_pdf_sections_use_saved_room_category_instead_of_product_or_property_type(self):
        hall = PropertyRoom.objects.create(property=self.property, name='Hall', painting_area='INTERIOR')
        balcony = PropertyRoom.objects.create(property=self.property, name='Balcony', painting_area='EXTERIOR')
        self.add_surface(hall, 'WALL', 'Hall wall', 10, 8)
        self.add_surface(balcony, 'WALL', 'Balcony wall', 5, 4)
        text = self.text()
        interior = text.split('INTERIOR MEASUREMENTS')[1].split('EXTERIOR MEASUREMENTS')[0]
        exterior = text.split('EXTERIOR MEASUREMENTS')[1].split('EXTERIOR TOTAL')[0]
        self.assertIn('Hall', interior)
        self.assertNotIn('Balcony', interior)
        self.assertIn('Balcony', exterior)
        self.assertNotIn('Hall', exterior)
        self.assertIn('100 sq.ft', text)
        self.assertIn('AREA CALCULATION REPORT', text)

    def test_classification_for_legacy_rooms_uses_surface_work_area(self):
        room = PropertyRoom.objects.create(property=self.property, name='Legacy exterior')
        surface = self.add_surface(room, 'WALL', 'Legacy wall', 2, 3)
        surface.work_area = 'EXTERIOR'
        surface.save()
        text = self.text()
        self.assertNotIn('INTERIOR MEASUREMENTS', text)
        self.assertIn('Legacy exterior', text.split('EXTERIOR MEASUREMENTS')[1])

    def test_legacy_mixed_room_is_split_into_two_sections_in_one_pdf(self):
        room = PropertyRoom.objects.create(property=self.property, name='Mixed room')
        self.add_surface(room, 'CEILING', 'Inside ceiling', 4, 5)
        outside = self.add_surface(room, 'WALL', 'Outside wall', 5, 6)
        outside.work_area = 'EXTERIOR'
        outside.save()
        text = self.text()
        interior = text.split('INTERIOR MEASUREMENTS')[1].split('EXTERIOR MEASUREMENTS')[0]
        exterior = text.split('EXTERIOR MEASUREMENTS')[1].split('EXTERIOR TOTAL')[0]
        self.assertIn('20 sq.ft', interior)
        self.assertNotIn('30 sq.ft', interior)
        self.assertIn('30 sq.ft', exterior)
        self.assertNotIn('20 sq.ft', exterior)
        self.assertIn('Inside ceiling', text)
        self.assertIn('Outside wall', text)
        self.assertIn('50 sq.ft', text)

    def test_interior_exterior_and_overall_aggregate_totals_are_present(self):
        hall = PropertyRoom.objects.create(property=self.property, name='Hall', painting_area='INTERIOR')
        balcony = PropertyRoom.objects.create(property=self.property, name='Balcony', painting_area='EXTERIOR')
        self.add_surface(hall, 'WALL', 'Hall wall', 10, 8)
        self.add_surface(hall, 'CEILING', 'Hall ceiling', 5, 4)
        self.add_surface(balcony, 'WALL', 'Outside wall', 3, 10)
        text = self.text()
        interior = ' '.join(text.split('INTERIOR MEASUREMENTS')[1].split('EXTERIOR MEASUREMENTS')[0].split())
        exterior = ' '.join(text.split('EXTERIOR MEASUREMENTS')[1].split('OVERALL TOTALS')[0].split())
        overall = ' '.join(text.split('OVERALL TOTALS')[1].split())
        self.assertIn('INTERIOR TOTAL 80 sq.ft 20 sq.ft 100 sq.ft', interior)
        self.assertIn('EXTERIOR TOTAL 30 sq.ft 30 sq.ft', exterior)
        self.assertIn('TOTAL MEASURED AREA 110 sq.ft 20 sq.ft 130 sq.ft', overall)
        self.assertNotIn('ALL ROOM MEASUREMENTS', text)
        self.assertNotIn('AREA CALCULATION DETAILS', text)

    def test_exterior_summary_immediately_follows_interior_summary_before_details(self):
        hall = PropertyRoom.objects.create(property=self.property, name='Hall', painting_area='INTERIOR')
        balcony = PropertyRoom.objects.create(property=self.property, name='Balcony', painting_area='EXTERIOR')
        self.add_surface(hall, 'WALL', 'Inside detail wall', 10, 8)
        self.add_surface(balcony, 'WALL', 'Outside detail wall', 5, 4)
        text = ' '.join(self.text().split())
        self.assertLess(text.index('INTERIOR TOTAL'), text.index('EXTERIOR MEASUREMENTS'))
        self.assertLess(text.index('EXTERIOR TOTAL'), text.index('Inside detail wall'))
        self.assertLess(text.index('Inside detail wall'), text.index('Outside detail wall'))
