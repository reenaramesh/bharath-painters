from decimal import Decimal

import pymupdf
from django.urls import reverse
from rest_framework.test import APITestCase

from accounts.models import BharathUser
from .models import Quotation
from .serializers import QuotationSerializer
from . import tests as quotation_fixture


class QuotationIdentitySnapshotTests(APITestCase):
    setUp = quotation_fixture.QuotationApiTests.setUp

    def test_issued_identity_agrees_in_owner_portal_and_pdf_after_profile_changes(self):
        portal = BharathUser.objects.create_user(
            mobile=self.customer.mobile, password="qa-customer",
            role=BharathUser.Roles.CUSTOMER,
        )
        self.customer.portal_user = portal
        self.customer.save(update_fields=["portal_user"])
        quote = Quotation.objects.create(
            contractor=self.contractor, customer=self.customer, property=self.property,
            quotation_number="IDENTITY-1", status=Quotation.Status.SENT,
            subtotal=100, grand_total=100,
        )
        original = dict(quote.contractor_snapshot)
        original["office_address"] = ""
        quote.contractor_snapshot = original
        quote.save(update_fields=["contractor_snapshot"])
        profile = self.contractor.contractor_profile
        profile.company_name = "Changed Company"
        profile.owner_name = "Changed Owner"
        profile.gst_number = "NEWGST"
        profile.office_address = "New address must not leak"
        profile.website = "https://changed.example.com"
        profile.save()
        self.contractor.email = "changed@example.com"
        self.contractor.save(update_fields=["email"])
        owner = self.client.get(reverse("quotation-detail", kwargs={"pk": quote.pk}))
        self.assertEqual(owner.data["contractor_details"]["company_name"], original["company_name"])
        self.assertEqual(owner.data["contractor_details"]["email"], original["email"])
        self.assertEqual(owner.data["contractor_details"]["office_address"], "")
        self.client.force_authenticate(portal)
        detail = self.client.get(reverse("customer-quotation-detail", kwargs={"pk": quote.pk}))
        listing = self.client.get(reverse("customer-quotation-list"))
        self.assertEqual(detail.data["contractor_name"], original["company_name"])
        self.assertEqual(listing.data[0]["contractor_owner"], original["owner_name"])
        pdf = self.client.get(reverse("customer-quotation-pdf", kwargs={"pk": quote.pk}))
        self.assertEqual(pdf.status_code, 200)
        with pymupdf.open(stream=pdf.content, filetype="pdf") as document:
            text = " ".join("".join(page.get_text() for page in document).split())
        self.assertIn(original["company_name"], text)
        self.assertNotIn("Changed Company", text)
        self.assertNotIn("New address must not leak", text)
        self.assertNotIn("changed.example.com", text)
        self.assertIn(original["gst_number"], text)
        self.assertNotIn("NEWGST", text)
        quote.refresh_from_db()
        self.assertEqual(quote.contractor_snapshot, original)
        self.assertEqual(quote.grand_total, Decimal("100"))
        self.assertEqual(quote.customer_snapshot["name"], "Quotation Customer")

    def test_sent_revision_retains_original_identity_and_draft_uses_current_profile(self):
        from .revision_utils import clone_quotation_revision

        quote = Quotation.objects.create(
            contractor=self.contractor, customer=self.customer, property=self.property,
            quotation_number="IDENTITY-REV", status=Quotation.Status.SENT,
        )
        original = dict(quote.contractor_snapshot)
        profile = self.contractor.contractor_profile
        profile.company_name = "New Draft Company"
        profile.save()
        revision = clone_quotation_revision(quote, "Identity revision", None)
        self.assertEqual(revision.contractor_snapshot, original)
        self.assertEqual(QuotationSerializer(revision).data["contractor_details"]["company_name"], "New Draft Company")
        response = self.client.post(reverse("quotation-submit", kwargs={"pk": revision.pk}), {}, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        revision.refresh_from_db()
        self.assertEqual(QuotationSerializer(revision).data["contractor_details"]["company_name"], original["company_name"])
        self.assertEqual(revision.contractor_snapshot, original)

    def test_all_issued_statuses_use_snapshot_and_missing_legacy_keys_fall_back(self):
        quote = Quotation.objects.create(
            contractor=self.contractor, customer=self.customer, property=self.property,
            quotation_number="IDENTITY-STATUS",
        )
        profile = self.contractor.contractor_profile
        profile.company_name = "Current Company"
        profile.save()
        for state, _ in Quotation.Status.choices:
            quote.status = state
            expected = "Current Company" if state == Quotation.Status.DRAFT else "Quotation Contractor Co"
            with self.subTest(state=state):
                self.assertEqual(QuotationSerializer(quote).data["contractor_details"]["company_name"], expected)
        quote.contractor_snapshot = {"company_name": "Legacy Company"}
        details = QuotationSerializer(quote).data["contractor_details"]
        self.assertEqual(details["company_name"], "Legacy Company")
        self.assertEqual(details["owner_name"], profile.owner_name)

    def test_issued_logo_path_and_layout_use_snapshot(self):
        from pathlib import Path
        from tempfile import TemporaryDirectory
        from django.test import override_settings
        from PIL import Image
        from .professional_pdf import _logo

        with TemporaryDirectory(prefix="quotation-logo-qa-") as directory:
            with override_settings(MEDIA_ROOT=directory):
                Image.new("RGB", (80, 40), "blue").save(Path(directory) / "original.png")
                Image.new("RGB", (80, 40), "red").save(Path(directory) / "replacement.png")
                profile = self.contractor.contractor_profile
                profile.company_logo = "original.png"
                profile.company_logo_shape = "RECTANGLE"
                profile.company_logo_position = {"x": 50, "y": 50, "zoom": 1}
                profile.save()
                quote = Quotation.objects.create(
                    contractor=self.contractor, customer=self.customer, property=self.property,
                    quotation_number="IDENTITY-LOGO", status=Quotation.Status.SENT,
                )
                profile.company_logo = "replacement.png"
                profile.company_logo_shape = "ROUND"
                profile.company_logo_position = {"x": 20, "y": 30, "zoom": 2}
                profile.save()
                details = QuotationSerializer(quote).data["contractor_details"]
                self.assertTrue(details["company_logo"].endswith("original.png"))
                self.assertEqual(details["company_logo_shape"], "RECTANGLE")
                self.assertEqual(details["company_logo_position"], {"x": 50, "y": 50, "zoom": 1})
                logo = _logo(profile, quote.contractor_snapshot, prefer_profile=False)
                self.assertEqual(Path(logo.filename), Path(directory) / "original.png")
                quote.contractor_snapshot["company_logo"] = ""
                self.assertIsNone(_logo(profile, quote.contractor_snapshot, prefer_profile=False))
