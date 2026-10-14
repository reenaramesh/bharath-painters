from copy import deepcopy
from decimal import Decimal
from django.urls import reverse
from rest_framework.test import APITestCase
from . import test_phase3 as phase3_fixture
from .models import Quotation, ServiceType


class QuotationBlockerTests(APITestCase):
    setUp = phase3_fixture.QuotationPhase3Tests.setUp
    item = phase3_fixture.QuotationPhase3Tests.item
    split = phase3_fixture.QuotationPhase3Tests.split
    payload = phase3_fixture.QuotationPhase3Tests.payload
    create = phase3_fixture.QuotationPhase3Tests.create

    def with_primer(self):
        payload = self.payload()
        primer = deepcopy(payload["items"][1])
        service = ServiceType.objects.create(name="Separate Primer", category_master=self.category, created_by=self.contractor)
        primer.update(service_type=service.pk, description="Separate primer", rate="5", discount_value="0")
        primer["specification_details"].update(assignment_id="primer", name="Primer process", exclude_from_standard=False)
        payload["items"].append(primer)
        return payload

    def test_replacement_texture_and_primer_process_save_reopen_and_delete(self):
        response = self.create(self.with_primer())
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data["subtotal"], "5325.00")
        self.assertEqual(response.data["grand_total"], "5817.40")
        draft = self.client.get(reverse("quotation-detail", kwargs={"pk": response.data["id"]})).data
        self.assertFalse(draft["items"][2]["specification_details"]["exclude_from_standard"])
        payload = {"expected_updated_at": draft["updated_at"], "rooms": draft["rooms"], "items": draft["items"], "discount_mode": "LINE"}
        payload["items"] = [payload["items"][0], payload["items"][2]]
        normal = payload["items"][0]
        normal["quantity"] = "470.00"
        normal["specification_details"]["contributions"][0]["quantity"] = 470
        normal["specification_details"]["contributions"][0]["sources"][-1]["quantity"] = 125
        saved = self.client.patch(reverse("quotation-draft-save", kwargs={"pk": draft["id"]}), payload, format="json")
        self.assertEqual(saved.status_code, 200, saved.data)
        self.assertEqual(Decimal(saved.data["subtotal"]), Decimal("5325"))
        self.assertEqual([Decimal(item["quantity"]) for item in saved.data["items"]], [Decimal("470"), Decimal("125")])

    def test_duplicate_or_unspecified_additional_process_rolls_back(self):
        for mutation in ("duplicate", "missing_service", "same_standard_service", "invalid_flag"):
            payload = self.with_primer()
            primer = payload["items"][-1]
            if mutation == "duplicate":
                duplicate = deepcopy(primer)
                duplicate["specification_details"]["assignment_id"] = "duplicate-primer"
                payload["items"].append(duplicate)
            elif mutation == "missing_service":
                primer["service_type"] = None
            elif mutation == "same_standard_service":
                primer["service_type"] = self.service.pk
                wall = self.walls[0]
                primer["quantity"] = "120"
                details = primer["specification_details"]
                details["surface_ids"] = [wall.pk]
                details["contributions"][0].update(quantity=120, sources=[{"surface_id": wall.pk, "original_area": 120, "quantity": 120}])
            else:
                primer["specification_details"]["exclude_from_standard"] = "false"
            with self.subTest(mutation=mutation):
                response = self.create(payload)
                self.assertEqual(response.status_code, 400, response.data)
                self.assertEqual(Quotation.objects.count(), 0)
