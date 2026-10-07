import json

from django.urls import reverse
from rest_framework import status
from rest_framework.test import APITestCase
from unittest.mock import patch

from accounts.models import BharathUser, ContractorProfile, PainterProfile, ProviderProfile, ProviderServiceClaim
from quotations.models import Customer, ServiceCategory, WorkDescription
from jobs.models import ContractorApplicatorTeam


class ProviderProfileApiTests(APITestCase):
    """One core service owns the workspace identity, so these tests guard the
    rule that additional services can never rename it."""

    def setUp(self):
        self.contractor = BharathUser.objects.create_user(
            mobile="9000000401", password="Pass123!", role="CONTRACTOR", first_name="Trade"
        )
        self.employee = BharathUser.objects.create_user(
            mobile="9000000402", password="Pass123!", role="PAINTER", first_name="Worker"
        )
        self.customer_user = BharathUser.objects.create_user(
            mobile="9000000403", password="Pass123!", role="CUSTOMER", first_name="Buyer"
        )
        self.painting = ServiceCategory.objects.create(
            name="Painting",
            workspace_name="Bharath Painters",
            contractor_label="Painter",
            employee_singular_label="Employee",
            employee_plural_label="Employees",
            icon=ServiceCategory.Icon.PAINT_ROLLER,
        )
        self.electrical = ServiceCategory.objects.create(
            name="Electrical",
            workspace_name="Bharath Electricals",
            contractor_label="Electrician",
            employee_singular_label="Technician",
            employee_plural_label="Technicians",
            icon=ServiceCategory.Icon.ELECTRICAL,
        )
        self.cleaning = ServiceCategory.objects.create(
            name="Cleaning",
            workspace_name="Bharath Cleaning Services",
            contractor_label="Cleaning Contractor",
            employee_singular_label="Cleaner",
            employee_plural_label="Cleaners",
            icon=ServiceCategory.Icon.GENERAL,
        )
        self.hidden = ServiceCategory.objects.create(
            name="Internal only", is_provider_selectable=False
        )
        self.painting_work = WorkDescription.objects.create(
            name="Interior putty", service_category=self.painting
        )
        self.electrical_work = WorkDescription.objects.create(
            name="Switch wiring", service_category=self.electrical
        )
        self.client.force_authenticate(self.contractor)

    def patch(self, payload):
        return self.client.patch(reverse("provider-profile"), payload, format="json")

    def test_get_creates_an_empty_profile(self):
        response = self.client.get(reverse("provider-profile"))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["completion_percent"], 0)
        self.assertFalse(response.data["is_published"])
        self.assertEqual(response.data["branding"]["platform_name"], "Bharath Apps")
        self.assertEqual(response.data["branding"]["workspace_name"], "Bharath Apps")
        self.assertEqual(response.data["branding"]["contractor_label"], "Contractor")
        self.assertTrue(ProviderProfile.objects.filter(user=self.contractor).exists())

    def test_customer_is_refused(self):
        self.client.force_authenticate(self.customer_user)
        response = self.client.get(reverse("provider-profile"))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)

    def test_employee_shares_the_endpoint(self):
        self.client.force_authenticate(self.employee)
        response = self.client.get(reverse("provider-profile"))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["is_employee"])

    def test_core_service_drives_the_branding(self):
        response = self.patch({"core_service": self.electrical.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["branding"]["workspace_name"], "Bharath Electricals")
        self.assertEqual(response.data["branding"]["contractor_label"], "Electrician")

    def test_cleaning_catalogue_labels_flow_to_profile_and_account_refresh(self):
        response = self.patch({"core_service": self.cleaning.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["branding"]["platform_name"], "Bharath Apps")
        self.assertEqual(response.data["branding"]["workspace_name"], "Bharath Cleaning Services")
        self.assertEqual(response.data["branding"]["contractor_label"], "Cleaning Contractor")
        self.client.force_authenticate(self.employee)
        self.patch({"core_service": self.cleaning.id})
        account = self.client.get(reverse("current-user"))
        self.assertEqual(account.data["branding"]["employee_singular_label"], "Cleaner")
        self.assertEqual(account.data["branding"]["employee_plural_label"], "Cleaners")

    def test_legacy_catalogue_defaults_resolve_from_core_service(self):
        # Existing rows received painting-era field defaults when the branding
        # columns were introduced. The resolver must not expose those as if
        # they were admin-configured values for a non-painting service.
        cleaning = ServiceCategory.objects.create(name="Cleaning")
        response = self.patch({"core_service": cleaning.id})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["branding"]["platform_name"], "Bharath Apps")
        self.assertEqual(response.data["branding"]["workspace_name"], "Bharath Cleaning Services")
        self.assertEqual(response.data["branding"]["contractor_label"], "Cleaning Contractor")
        self.client.force_authenticate(self.employee)
        response = self.patch({"core_service": cleaning.id})
        self.assertEqual(response.data["branding"]["employee_singular_label"], "Cleaner")
        self.assertEqual(response.data["branding"]["employee_plural_label"], "Cleaners")
        self.assertEqual(self.client.get(reverse("current-user")).data["branding"]["workspace_name"], "Bharath Cleaning Services")

    def test_additional_painting_does_not_change_cleaning_branding_or_other_users(self):
        self.patch({"core_service": self.cleaning.id})
        response = self.patch({"additional_services": [self.painting.id]})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["branding"]["workspace_name"], "Bharath Cleaning Services")
        self.assertEqual(response.data["branding"]["contractor_label"], "Cleaning Contractor")
        self.client.force_authenticate(self.employee)
        self.patch({"core_service": self.painting.id})
        self.client.force_authenticate(self.contractor)
        account = self.client.get(reverse("current-user"))
        self.assertEqual(account.data["branding"]["workspace_name"], "Bharath Cleaning Services")

    def test_partial_update_without_services_does_not_fail(self):
        self.patch({"core_service": self.painting.id, "additional_services": [self.electrical.id]})
        # Regression: the fallback for an omitted field used to be the related
        # manager, which raised TypeError instead of validating.
        response = self.patch({"headline": "Painting specialist"})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(
            response.data["additional_service_names"], ["Electrical"]
        )

    def test_unrelated_patch_keeps_the_selected_core_service(self):
        self.patch({"core_service": self.cleaning.id})
        response = self.patch({"headline": "A fresh headline"})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["core_service"], self.cleaning.id)
        self.assertEqual(response.data["branding"]["workspace_name"], "Bharath Cleaning Services")

    def test_contractor_photo_and_logo_positions_save_and_return_in_profiles(self):
        ContractorProfile.objects.create(user=self.contractor, company_name="Positioned Co", owner_name="Trade")
        positions = {"x": 28, "y": 63, "zoom": 1.7}
        response = self.client.patch(reverse("contractor-profile"), {
            "profile_photo_position": positions,
            "company_logo_position": {"x": 72, "y": 41, "zoom": 2},
        }, format="json")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["profile_photo_position"], positions)
        self.assertEqual(response.data["company_logo_position"], {"x": 72, "y": 41, "zoom": 2})
        self.assertEqual(self.client.get(reverse("current-user")).data["profile_photo_position"], positions)

    def test_employee_photo_position_is_saved_by_the_existing_profile_endpoint(self):
        self.client.force_authenticate(self.employee)
        position = {"x": 24, "y": 70, "zoom": 2.25}
        response = self.client.patch(reverse("applicator-profile"), {
            "profile_photo_position": json.dumps(position),
        }, format="multipart")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["profile_photo_position"], position)
        self.assertEqual(self.client.get(reverse("current-user")).data["profile_photo_position"], position)

    def test_customer_photo_position_is_saved_by_the_existing_profile_endpoint(self):
        Customer.objects.create(
            name="Buyer", mobile=self.customer_user.mobile,
            normalized_mobile=self.customer_user.mobile, portal_user=self.customer_user,
        )
        self.client.force_authenticate(self.customer_user)
        position = {"x": 35, "y": 68, "zoom": 1.5}
        response = self.client.patch(reverse("customer-profile"), {
            "name": "Buyer", "profile_photo_position": position,
        }, format="json")
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["profile_photo_position"], position)

    def test_additional_services_never_rename_the_workspace(self):
        self.patch({"core_service": self.painting.id})
        response = self.patch({"additional_services": [self.electrical.id]})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["branding"]["workspace_name"], "Bharath Painters")
        self.assertEqual(response.data["branding"]["contractor_label"], "Painter")

    def test_core_service_cannot_repeat_as_an_additional_service(self):
        response = self.patch(
            {"core_service": self.painting.id, "additional_services": [self.painting.id]}
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("additional_services", response.data)

    def test_non_selectable_service_is_rejected(self):
        response = self.patch({"core_service": self.hidden.id})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        response = self.patch({"additional_services": [self.hidden.id]})
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("additional_services", response.data)

    def test_sub_service_claims_are_replaced_with_the_payload(self):
        self.patch(
            {
                "core_service": self.painting.id,
                "additional_services": [self.electrical.id],
                "service_claims": [
                    {"category": self.painting.id, "work_description": self.painting_work.id},
                ],
            }
        )
        profile = ProviderProfile.objects.get(user=self.contractor)
        self.assertEqual(profile.service_claims.count(), 1)

        self.patch(
            {
                "service_claims": [
                    {"category": self.electrical.id, "work_description": self.electrical_work.id},
                ]
            }
        )
        profile.refresh_from_db()
        claim = ProviderServiceClaim.objects.get(provider=profile)
        self.assertEqual(claim.category_id, self.electrical.id)

    def test_claim_outside_the_offered_services_is_rejected(self):
        self.patch({"core_service": self.painting.id})
        response = self.patch(
            {
                "service_claims": [
                    {"category": self.electrical.id, "work_description": self.electrical_work.id},
                ]
            }
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("service_claims", response.data)

    def test_claim_with_a_mismatched_sub_service_is_rejected(self):
        self.patch({"core_service": self.painting.id})
        response = self.patch(
            {
                "service_claims": [
                    {"category": self.painting.id, "work_description": self.electrical_work.id},
                ]
            }
        )
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST, response.data)
        self.assertIn("service_claims", response.data)

    def test_invalid_claim_replacement_preserves_profile_and_existing_claims(self):
        self.patch({"core_service": self.painting.id, "headline": "Original", "service_claims": [
            {"category": self.painting.id, "work_description": self.painting_work.id}
        ]})
        profile = ProviderProfile.objects.get(user=self.contractor)
        previous_ids = list(profile.service_claims.values_list("id", flat=True))
        response = self.patch({"headline": "Must not persist", "team_size": 99, "service_claims": [
            {"category": self.painting.id, "work_description": self.electrical_work.id}
        ]})
        self.assertEqual(response.status_code, 400, response.data)
        profile.refresh_from_db()
        self.assertEqual(profile.headline, "Original")
        self.assertEqual(profile.team_size, 0)
        self.assertEqual(list(profile.service_claims.values_list("id", flat=True)), previous_ids)

    def test_duplicate_claims_including_category_only_are_rejected(self):
        for work in [self.painting_work.id, None]:
            claim = {"category": self.painting.id, "work_description": work}
            response = self.patch({"core_service": self.painting.id, "service_claims": [claim, claim]})
            self.assertEqual(response.status_code, 400, response.data)
            self.assertIn("service_claims", response.data)

    def test_employee_can_publish_with_primary_trade_without_catalogue_sub_services(self):
        self.client.force_authenticate(self.employee)
        self.patch({"core_service": self.painting.id, "about": "Experienced specialist"})
        response = self.client.post(reverse("provider-profile"))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(response.data["is_draft"])

    def test_completion_percent_tracks_the_core_steps(self):
        # service_areas belongs to the company profile, so it is set there and
        # reaches the provider profile as a mirror.
        ContractorProfile.objects.create(
            user=self.contractor, company_name="Trade", service_areas="Whitefield"
        )
        response = self.patch(
            {
                "core_service": self.painting.id,
                "about": "We paint flats.",
            }
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["service_areas"], "Whitefield")
        self.assertEqual(response.data["completion_percent"], 100)

    def test_publishing_freezes_the_branding(self):
        self.patch(
            {
                "core_service": self.painting.id,
                "about": "We paint flats.",
                "service_areas": "Whitefield",
            }
        )
        response = self.client.post(reverse("provider-profile"))
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertTrue(response.data["is_published"])
        self.assertEqual(response.data["brand_snapshot"]["workspace_name"], "Bharath Painters")

        # A later core-service change does not rewrite what was published.
        self.patch({"core_service": self.electrical.id})
        profile = ProviderProfile.objects.get(user=self.contractor)
        self.assertEqual(profile.brand_snapshot["workspace_name"], "Bharath Painters")
        self.assertEqual(profile.resolved_branding()["workspace_name"], "Bharath Electricals")

    def test_republishing_explicitly_updates_the_published_brand_snapshot(self):
        self.patch({"core_service": self.painting.id})
        self.client.post(reverse("provider-profile"))
        self.patch({"core_service": self.cleaning.id})
        # Saving current settings does not silently rewrite published identity.
        profile = ProviderProfile.objects.get(user=self.contractor)
        self.assertEqual(profile.brand_snapshot["workspace_name"], "Bharath Painters")
        response = self.client.post(reverse("provider-profile"))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["brand_snapshot"]["workspace_name"], "Bharath Cleaning Services")

    def test_publishing_requires_a_core_service(self):
        response = self.client.post(reverse("provider-profile"))
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn("core_service", response.data)

    def test_workspace_name_override_wins_over_the_core_service(self):
        response = self.patch(
            {"core_service": self.painting.id, "workspace_name_override": "Bharath Studio"}
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["branding"]["workspace_name"], "Bharath Studio")

    def test_account_refresh_returns_current_branding(self):
        self.patch({"core_service": self.electrical.id, "workspace_name_override": "QA Workspace"})
        response = self.client.get(reverse("current-user"))
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["branding"]["workspace_name"], "QA Workspace")
        self.assertEqual(response.data["branding"]["contractor_label"], "Electrician")

    def test_employee_trade_save_preserves_personal_fields_and_free_text(self):
        personal = PainterProfile.objects.create(user=self.employee, skills="Bespoke restoration, Free-text skill", experience_years=13,
            preferred_locations="Mysuru", current_location="Custom work-seeking city", permanent_address="Home address")
        self.client.force_authenticate(self.employee)
        response = self.patch({"core_service": self.painting.id, "about": "Professional introduction", "base_location": "Usual base"})
        self.assertEqual(response.status_code, 200, response.data)
        personal.refresh_from_db()
        self.assertEqual(personal.skills, "Bespoke restoration, Free-text skill")
        self.assertEqual(personal.experience_years, 13)
        response = self.client.patch(reverse("applicator-profile"), {"name": "Updated Worker", "emergency_contact_name": "Contact"}, format="multipart")
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data["skills"], personal.skills)
        self.assertEqual(response.data["current_location"], "Custom work-seeking city")
        self.assertEqual(response.data["preferred_locations"], "Mysuru")
        self.assertEqual(response.data["permanent_address"], "Home address")
        provider = ProviderProfile.objects.get(user=self.employee)
        self.assertEqual(provider.core_service_id, self.painting.id)
        self.assertEqual(provider.base_location, "Usual base")
        self.employee.refresh_from_db()
        response = self.client.get(reverse("current-user"))
        self.assertEqual(response.data["display_name"], "Updated Worker")


class SharedProfileFieldTests(APITestCase):
    """The merged settings page shows one input per shared concept, so exactly
    one record may own each value."""

    def setUp(self):
        self.contractor = BharathUser.objects.create_user(
            mobile="9000000411", password="Pass123!", role="CONTRACTOR", first_name="Trade"
        )
        self.employee = BharathUser.objects.create_user(
            mobile="9000000412", password="Pass123!", role="PAINTER", first_name="Worker"
        )
        self.contractor_profile = ContractorProfile.objects.create(
            user=self.contractor,
            company_name="Bharath Painters",
            service_areas="Whitefield",
            years_in_business=9,
            number_of_painters=4,
        )

    def provider_patch(self, payload, user=None):
        self.client.force_authenticate(user or self.contractor)
        return self.client.patch(reverse("provider-profile"), payload, format="json")

    def contractor_patch(self, payload):
        self.client.force_authenticate(self.contractor)
        return self.client.patch(
            reverse("contractor-profile"), payload, format="json", HTTP_ACCEPT="application/json"
        )

    def test_company_profile_values_mirror_onto_the_provider_profile(self):
        # Opening the trade tab is what creates the provider profile in real
        # use; editing company details alone must not create one.
        self.provider_patch({"headline": "Painters"})
        self.contractor_patch({"service_areas": "Marathahalli", "years_in_business": 11})
        provider = ProviderProfile.objects.get(user=self.contractor)
        self.assertEqual(provider.service_areas, "Marathahalli")
        self.assertEqual(provider.years_in_business, 11)

    def test_editing_company_details_does_not_create_a_provider_profile(self):
        self.contractor_patch({"service_areas": "Marathahalli"})
        self.assertFalse(ProviderProfile.objects.filter(user=self.contractor).exists())

    def test_legacy_provider_coverage_write_updates_the_company_owner(self):
        response = self.provider_patch({"service_areas": "Somewhere Else"})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.assertEqual(response.data["service_areas"], "Somewhere Else")
        self.contractor_profile.refresh_from_db()
        self.assertEqual(self.contractor_profile.service_areas, "Somewhere Else")

    def test_team_size_is_owned_by_the_provider_and_mirrors_onto_the_company(self):
        response = self.provider_patch({"team_size": 12})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        self.contractor_profile.refresh_from_db()
        self.assertEqual(self.contractor_profile.number_of_painters, 12)

    def test_legacy_company_workforce_write_updates_the_provider_alias(self):
        self.provider_patch({"team_size": 12})
        response = self.contractor_patch({"number_of_painters": 99})
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        provider = ProviderProfile.objects.get(user=self.contractor)
        self.assertEqual(provider.team_size, 99)

    def test_employee_legacy_fields_remain_compatible_and_isolated(self):
        self.provider_patch({"team_size": 12}, user=self.employee)
        response = self.provider_patch(
            {"team_size": 30, "years_in_business": 5, "service_areas": "Whitefield"},
            user=self.employee,
        )
        self.assertEqual(response.status_code, status.HTTP_200_OK, response.data)
        provider = ProviderProfile.objects.get(user=self.employee)
        self.assertEqual(provider.team_size, 30)
        self.assertEqual(provider.years_in_business, 5)
        self.assertEqual(provider.service_areas, "Whitefield")
        self.assertFalse(ContractorProfile.objects.filter(user=self.employee).exists())

    def test_an_employee_save_never_creates_a_company_profile(self):
        self.provider_patch({"team_size": 5}, user=self.employee)
        self.assertFalse(ContractorProfile.objects.filter(user=self.employee).exists())

    def test_patch_omission_preserves_declared_workforce_even_with_legacy_conflict(self):
        provider = ProviderProfile.objects.create(user=self.contractor, team_size=8)
        self.provider_patch({"headline": "Updated introduction"})
        provider.refresh_from_db()
        self.contractor_profile.refresh_from_db()
        self.assertEqual(provider.team_size, 8)
        self.assertEqual(self.contractor_profile.number_of_painters, 4)

    def test_first_get_returns_seeded_values_immediately(self):
        self.client.force_authenticate(self.contractor)
        response = self.client.get(reverse("provider-profile"))
        self.assertEqual(response.data["service_areas"], "Whitefield")
        self.assertEqual(response.data["years_in_business"], 9)
        self.assertEqual(response.data["team_size"], 4)

    def test_explicit_zero_workforce_and_experience_are_saved(self):
        response = self.provider_patch({"team_size": 0, "years_in_business": 0})
        self.assertEqual(response.status_code, 200, response.data)
        self.contractor_profile.refresh_from_db()
        self.assertEqual(self.contractor_profile.number_of_painters, 0)
        self.assertEqual(self.contractor_profile.years_in_business, 0)

    def test_omitted_legacy_coverage_is_preserved_on_unrelated_saves(self):
        provider = ProviderProfile.objects.create(user=self.contractor, service_areas="Legacy coverage", years_in_business=3)
        self.provider_patch({"headline": "Updated"})
        self.contractor_patch({"company_name": "Updated company"})
        provider.refresh_from_db()
        self.contractor_profile.refresh_from_db()
        self.assertEqual(provider.service_areas, "Legacy coverage")
        self.assertEqual(provider.years_in_business, 3)
        self.assertEqual(self.contractor_profile.service_areas, "Whitefield")
        self.assertEqual(self.contractor_profile.years_in_business, 9)

    def test_invalid_company_save_does_not_remove_document(self):
        self.contractor_profile.gst_document = "contractor-documents/qa-existing.pdf"
        self.contractor_profile.save()
        with patch.object(self.contractor_profile.gst_document.storage, "delete") as delete:
            response = self.contractor_patch({"clear_gst_document": True, "years_in_business": -1})
            self.assertEqual(response.status_code, 400, response.data)
            delete.assert_not_called()
        self.contractor_profile.refresh_from_db()
        self.assertEqual(self.contractor_profile.gst_document.name, "contractor-documents/qa-existing.pdf")

    def test_multipart_clear_document_is_applied_after_successful_save(self):
        self.contractor_profile.gst_document = "contractor-documents/qa-existing.pdf"
        self.contractor_profile.save()
        self.client.force_authenticate(self.contractor)
        with patch.object(self.contractor_profile.gst_document.storage, "delete") as delete:
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.patch(reverse("contractor-profile"), {"clear_gst_document": "1"}, format="multipart")
                self.assertEqual(response.status_code, 200, response.data)
            delete.assert_called_once_with("contractor-documents/qa-existing.pdf")
        self.contractor_profile.refresh_from_db()
        self.assertFalse(self.contractor_profile.gst_document)

    def test_false_document_clear_flag_preserves_document(self):
        self.contractor_profile.gst_document = "contractor-documents/qa-existing.pdf"
        self.contractor_profile.save()
        response = self.contractor_patch({"clear_gst_document": "false"})
        self.assertEqual(response.status_code, 200, response.data)
        self.contractor_profile.refresh_from_db()
        self.assertTrue(self.contractor_profile.gst_document)

    def test_declared_workforce_is_independent_of_registered_memberships(self):
        membership = ContractorApplicatorTeam.objects.create(contractor=self.contractor, painter=self.employee, employment_type="IN_HOUSE")
        response = self.provider_patch({"team_size": 12})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(self.contractor.applicator_team_members.count(), 1)
        self.contractor_profile.refresh_from_db()
        self.assertEqual(self.contractor_profile.number_of_painters, 12)
        membership.delete()
        provider = ProviderProfile.objects.get(user=self.contractor)
        self.assertEqual(provider.team_size, 12)
