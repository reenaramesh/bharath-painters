"""Read-only subcontract attention, exercised on the isolated audit database."""
from datetime import timedelta
from decimal import Decimal

from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone

from accounts.models import BharathUser
from quotations.models import Customer, Property, Quotation
from .models import (
    AdditionalWorkRequest,
    CorrectionRequest,
    SubcontractWorkOrder,
    WorkOrderCompletion,
    WorkOrderEvent,
)


class SubcontractDashboardAttentionTests(TestCase):
    @classmethod
    def setUpTestData(cls):
        cls.owner = BharathUser.objects.create_user(mobile="9011910101", role="CONTRACTOR")
        cls.receiver = BharathUser.objects.create_user(mobile="9011910102", role="CONTRACTOR")
        cls.other = BharathUser.objects.create_user(mobile="9011910103", role="CONTRACTOR")
        customer = Customer.objects.create(contractor=cls.owner, name="Attention customer", mobile="9011910104")
        site = Property.objects.create(contractor=cls.owner, customer=customer, name="Attention site")
        cls.quotation = Quotation.objects.create(contractor=cls.owner, customer=customer, property=site)

    def order(self, **changes):
        values = {
            "quotation": self.quotation,
            "main_contractor": self.owner,
            "receiving_contractor": self.receiver,
            "status": SubcontractWorkOrder.Status.SUBMITTED_FOR_REVIEW,
            "project_title": "Interior walls",
            "reference": f"ATTN-{SubcontractWorkOrder.objects.count() + 1}",
        }
        values.update(changes)
        return SubcontractWorkOrder.objects.create(**values)

    def extra(self, work_order, **changes):
        values = {"description": "Extra ceiling", "estimated_amount": Decimal("123.45"), "requested_by": self.receiver}
        values.update(changes)
        return AdditionalWorkRequest.objects.create(work_order=work_order, **values)

    def attention(self, **pagination):
        from .dashboard import subcontract_attention
        return subcontract_attention(self.owner, **pagination)

    def test_only_main_contractor_gets_reviews_and_extra_work_approvals(self):
        owned = self.order()
        pending = self.extra(owned)
        received = self.order(main_contractor=self.other, receiving_contractor=self.owner)
        foreign = self.order(main_contractor=self.other)
        self.extra(received, requested_by=self.owner)
        self.extra(foreign)

        result = self.attention()

        self.assertEqual(result["review_count"], 1)
        self.assertEqual(result["additional_work_count"], 1)
        self.assertEqual(result["reviews"], [{
            "id": owned.pk, "reference": owned.reference, "project_title": owned.project_title,
            "url": f"/subcontract-work-orders/{owned.pk}",
        }])
        self.assertEqual(result["additional_work"], [{
            "id": pending.pk, "work_order": owned.pk, "reference": owned.reference,
            "project_title": owned.project_title, "description": pending.description,
            "estimated_amount": "123.45", "url": f"/subcontract-work-orders/{owned.pk}",
        }])

    def test_reviews_count_current_status_once_despite_submission_and_correction_history(self):
        current = self.order()
        for number in range(1, 4):
            completion = WorkOrderCompletion.objects.create(work_order=current, submission_number=number, is_current=number == 3)
            CorrectionRequest.objects.create(work_order=current, completion=completion, note="Historic correction")
            WorkOrderEvent.objects.create(work_order=current, to_status="SUBMITTED_FOR_REVIEW")
        for state in SubcontractWorkOrder.Status.values:
            if state != SubcontractWorkOrder.Status.SUBMITTED_FOR_REVIEW:
                self.order(status=state)

        result = self.attention()

        self.assertEqual(result["review_count"], 1)
        self.assertEqual([row["id"] for row in result["reviews"]], [current.pk])

    def test_pending_requests_are_individual_items_even_when_parent_is_closed(self):
        expected = []
        for state in ("IN_PROGRESS", "COMPLETED", "CANCELLED"):
            order = self.order(status=state)
            expected.extend([self.extra(order).pk, self.extra(order).pk])
            for decision in ("APPROVED", "DECLINED"):
                self.extra(order, status=decision, approved_amount="75.00")

        result = self.attention()

        self.assertEqual(result["review_count"], 0)
        self.assertEqual(result["additional_work_count"], 6)
        self.assertEqual({row["id"] for row in result["additional_work"]}, set(expected))

    def test_previews_are_bounded_with_full_counts_and_deterministic_pagination(self):
        orders = [self.order() for _ in range(9)]
        extras = [self.extra(order) for order in orders]
        tied = timezone.now() - timedelta(days=2)
        SubcontractWorkOrder.objects.update(updated_at=tied)
        AdditionalWorkRequest.objects.update(created_at=tied)
        newest = tied + timedelta(days=1)
        # Timestamp takes priority over ID; equal timestamps use descending ID.
        SubcontractWorkOrder.objects.filter(pk=orders[0].pk).update(updated_at=newest)
        AdditionalWorkRequest.objects.filter(pk=extras[0].pk).update(created_at=newest)
        ordered_ids = [orders[0].pk] + [order.pk for order in reversed(orders[1:])]
        extra_ids = [extras[0].pk] + [extra.pk for extra in reversed(extras[1:])]

        default = self.attention()
        page = self.attention(offset=2, limit=3)

        for result in (default, page):
            self.assertEqual((result["review_count"], result["additional_work_count"]), (9, 9))
        self.assertEqual([row["id"] for row in default["reviews"]], ordered_ids[:6])
        self.assertEqual([row["id"] for row in default["additional_work"]], extra_ids[:6])
        self.assertEqual([row["id"] for row in page["reviews"]], ordered_ids[2:5])
        self.assertEqual([row["id"] for row in page["additional_work"]], extra_ids[2:5])
        for pagination in ({"limit": 0}, {"offset": 99}):
            result = self.attention(**pagination)
            self.assertEqual((result["review_count"], result["additional_work_count"]), (9, 9))
            self.assertEqual(result["reviews"], [])
            self.assertEqual(result["additional_work"], [])

    def test_empty_queues_have_stable_shape(self):
        self.assertEqual(self.attention(), {
            "review_count": 0, "additional_work_count": 0, "reviews": [], "additional_work": [],
        })

    def test_helper_reads_only_and_keeps_query_count_bounded(self):
        order = self.order()
        self.extra(order)
        before = {
            "orders": list(SubcontractWorkOrder.objects.values()),
            "extras": list(AdditionalWorkRequest.objects.values()),
            "events": list(WorkOrderEvent.objects.values()),
            "completions": list(WorkOrderCompletion.objects.values()),
            "corrections": list(CorrectionRequest.objects.values()),
        }

        with CaptureQueriesContext(connection) as queries:
            first = self.attention()
        self.assertEqual(len(queries), 4)
        self.assertTrue(all(query["sql"].lstrip().upper().startswith("SELECT") for query in queries))
        self.assertEqual(first, self.attention())
        self.assertEqual(before, {
            "orders": list(SubcontractWorkOrder.objects.values()),
            "extras": list(AdditionalWorkRequest.objects.values()),
            "events": list(WorkOrderEvent.objects.values()),
            "completions": list(WorkOrderCompletion.objects.values()),
            "corrections": list(CorrectionRequest.objects.values()),
        })
