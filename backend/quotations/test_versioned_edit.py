from uuid import uuid4
from django.urls import reverse
from rest_framework.test import APITestCase
from .test_draft_repair import DraftRepairTests
from .models import Quotation, ActivityLog
from jobs.models import WorkSchedule
from django.utils import timezone

class VersionedQuotationTests(APITestCase):
    setUp = DraftRepairTests.setUp
    draft = DraftRepairTests.draft
    payload = DraftRepairTests.payload

    def save_version(self, source, payload):
        return self.client.post(f'/api/quotations/{source.pk}/versions/',payload,format='json')

    def request_payload(self, source, room, item):
        return {**self.payload(source,room,item),'edit_request_id':str(uuid4())}

    def test_edit_every_stage_preserves_original_and_clones_rooms_and_lines(self):
        for state in Quotation.Status.values:
            with self.subTest(state=state):
                source,room,item=self.draft()
                source.status=state
                source.save(update_fields=['status'])
                old_number,old_updated=source.quotation_number,source.updated_at
                response=self.save_version(source,self.request_payload(source,room,item))
                self.assertEqual(response.status_code,201,response.data)
                revised=Quotation.objects.get(pk=response.data['id'])
                source.refresh_from_db();item.refresh_from_db()
                self.assertEqual((source.status,source.notes,source.quotation_number,source.updated_at),(state,'Original',old_number,old_updated))
                self.assertEqual(item.description,'Saved work')
                self.assertEqual((revised.status,revised.version_number,revised.revision_of_id),('DRAFT',2,source.pk))
                self.assertEqual(revised.notes,'Edited')
                self.assertNotEqual(revised.rooms.get().pk,room.pk)
                self.assertEqual(revised.items.get().room_id,revised.rooms.get().pk)
                self.assertEqual(str(revised.grand_total),'63.72')

    def test_retries_are_idempotent_and_changed_reuse_is_rejected(self):
        source,room,item=self.draft();payload=self.request_payload(source,room,item)
        first=self.save_version(source,payload)
        self.assertEqual(first.status_code,201,first.data)
        second=self.save_version(source,payload)
        self.assertEqual(second.status_code,200,second.data)
        self.assertEqual(first.data['id'],second.data['id'])
        payload['notes']='Changed request'
        self.assertEqual(self.save_version(source,payload).status_code,409)
        self.assertEqual(Quotation.objects.filter(revision_of=source).count(),1)
    def test_old_source_edit_uses_next_family_version_and_preserves_schedule(self):
        source,room,item=self.draft();source.status='IN_PROGRESS';source.save(update_fields=['status'])
        schedule=WorkSchedule.objects.create(quotation=source,proposed_by=self.contractor,proposed_start_date=timezone.localdate(),proposed_end_date=timezone.localdate(),status='IN_PROGRESS',advance_amount=100,payment_status='CONFIRMED')
        for expected in (2,3):
            response=self.save_version(source,self.request_payload(source,room,item))
            self.assertEqual(response.status_code,201,response.data)
            self.assertEqual(response.data['version_number'],expected)
        schedule.refresh_from_db()
        self.assertEqual((schedule.quotation_id,schedule.status,schedule.advance_amount),(source.pk,'IN_PROGRESS',100))
        self.assertEqual(ActivityLog.objects.filter(module='Quotation versions').count(),2)

    def test_invalid_payload_is_atomic_and_stale_or_foreign_edits_are_rejected(self):
        source,room,item=self.draft();payload=self.request_payload(source,room,item)
        payload['items'][0]['room_index']=99
        self.assertEqual(self.save_version(source,payload).status_code,400)
        self.assertEqual(Quotation.objects.filter(revision_of=source).count(),0)
        payload=self.request_payload(source,room,item);payload['expected_updated_at']='2020-01-01T00:00:00Z'
        self.assertEqual(self.save_version(source,payload).status_code,409)
        payload=self.request_payload(source,room,item);payload['edit_request_id']=[]
        self.assertEqual(self.save_version(source,payload).status_code,400)
        from accounts.models import BharathUser
        outsider=BharathUser.objects.create_user(mobile='9011969998',role='CONTRACTOR',is_verified=True,verification_status='VERIFIED')
        self.client.force_authenticate(outsider)
        self.assertEqual(self.save_version(source,self.request_payload(source,room,item)).status_code,404)
        self.client.force_authenticate(BharathUser.objects.create_user(mobile='9011969997',role='CUSTOMER'))
        self.assertEqual(self.save_version(source,self.request_payload(source,room,item)).status_code,403)
    def test_customer_revision_after_private_edit_uses_next_free_version(self):
        from .revision_utils import clone_quotation_revision
        source,room,item=self.draft();source.status='SENT';source.save(update_fields=['status'])
        self.assertEqual(self.save_version(source,self.request_payload(source,room,item)).status_code,201)
        revised=clone_quotation_revision(source,'Requested changes',timezone.now())
        self.assertEqual(revised.version_number,3)
    def test_customer_comparison_skips_private_drafts_and_approval_finds_existing_work(self):
        from accounts.models import BharathUser
        source,room,item=self.draft();source.status='IN_PROGRESS';source.save(update_fields=['status'])
        portal=BharathUser.objects.create_user(mobile='9011969981',role='CUSTOMER')
        self.customer.portal_user=portal;self.customer.save(update_fields=['portal_user'])
        schedule=WorkSchedule.objects.create(quotation=source,proposed_by=self.contractor,proposed_start_date=timezone.localdate(),proposed_end_date=timezone.localdate(),status='IN_PROGRESS',advance_amount=100,payment_status='CONFIRMED')
        secret=self.request_payload(source,room,item);secret['notes']='PRIVATE CONTRACTOR INTERNAL SECRET'
        self.assertEqual(self.save_version(source,secret).status_code,201)
        public=self.save_version(source,self.request_payload(source,room,item));self.assertEqual(public.status_code,201,public.data)
        new_id=public.data['id']
        submitted=self.client.post(reverse('quotation-submit',args=[new_id]),{},format='json')
        self.assertEqual(submitted.status_code,200,submitted.data)
        self.assertTrue(submitted.data['is_revision'])
        self.client.force_authenticate(portal)
        detail=self.client.get(reverse('customer-quotation-detail',args=[new_id]))
        self.assertEqual(detail.status_code,200,detail.data)
        self.assertNotIn('PRIVATE CONTRACTOR INTERNAL SECRET',str(detail.data))
        self.assertEqual(detail.data['revision_changes']['previous_id'],source.pk)
        # A later public-but-unapproved version must not hide work on the base.
        private=Quotation.objects.get(revision_of=source,version_number=2);private.status='SENT';private.save(update_fields=['status'])
        approved=self.client.post(reverse('customer-quotation-action',args=[new_id]),{'action':'APPROVE'},format='json')
        self.assertEqual(approved.status_code,200,approved.data)
        schedule.refresh_from_db();self.assertEqual(schedule.quotation_id,new_id)
        self.assertEqual(approved.data['next_step'],'WORK_IN_PROGRESS')
from django.test import SimpleTestCase
from rest_framework.exceptions import ValidationError

class NestedEditIdTests(SimpleTestCase):
    def test_non_decimal_and_oversized_nested_ids_are_validation_errors(self):
        from .version_views import remap_edit
        for value in ([], {}, True, '\u00b2', '1'*30):
            with self.subTest(value=str(value)):
                with self.assertRaises(ValidationError):
                    remap_edit({'rooms':[], 'items':[{'id':value}]},{},{1:2})
