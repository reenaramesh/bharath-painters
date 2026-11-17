"""Regression sources for the next authorized verification round; not run in this batch."""
from io import BytesIO
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch

from django.core.exceptions import ImproperlyConfigured
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from django.urls import reverse
from PIL import Image
from pypdf import PdfWriter
from rest_framework.test import APITestCase

from accounts.models import BharathUser
from .catalogue_storage import PrivateCatalogueStorage
from .catalogue_views import MAX_CATALOGUE_BYTES
from .models import (
    CatalogueVersion, ChatAttachment, ChatConversation, ChatMessage,
    ContractorCatalogue, ContractorCustomerConnection, Customer, PaintType, ServiceCategory,
)


class CatalogueLibraryTests(APITestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.media = Path(self.temporary.name) / "public"
        self.private = Path(self.temporary.name) / "private"
        self.settings_override = override_settings(MEDIA_ROOT=self.media, PRIVATE_CATALOGUE_ROOT=self.private)
        self.settings_override.enable()
        self.addCleanup(self.settings_override.disable)
        verified = {"is_verified": True, "verification_status": "VERIFIED"}
        self.owner = BharathUser.objects.create_user(mobile="9000633001", role="CONTRACTOR", **verified)
        self.other = BharathUser.objects.create_user(mobile="9000633002", role="CONTRACTOR", **verified)
        self.portal = BharathUser.objects.create_user(mobile="9000633003", role="CUSTOMER", **verified)
        self.painter = BharathUser.objects.create_user(mobile="9000633004", role="PAINTER", **verified)
        self.admin = BharathUser.objects.create_user(mobile="9000633005", role="ADMIN", **verified)
        self.customer = Customer.objects.create(contractor=self.owner, portal_user=self.portal, name="Recipient", mobile=self.portal.mobile)
        self.connection, _ = ContractorCustomerConnection.objects.update_or_create(
            contractor=self.owner, customer=self.customer, defaults={"status": "CONNECTED"},
        )
        self.conversation, _ = ChatConversation.objects.get_or_create(
            contractor=self.owner, customer=self.customer, defaults={"connection": self.connection},
        )
        self.list_url = reverse("catalogue-list")
        self.messages_url = reverse("chat-messages", args=[self.conversation.pk])
        self.client.force_authenticate(self.owner)

    def pdf(self, name="catalogue.pdf", *, width=72, encrypted=False):
        writer = PdfWriter()
        writer.add_blank_page(width=width, height=72)
        if encrypted:
            writer.encrypt("private-password")
        stream = BytesIO()
        writer.write(stream)
        return SimpleUploadedFile(name, stream.getvalue(), content_type="application/pdf")

    def image(self, image_format, name, content_type):
        stream = BytesIO()
        Image.new("RGB", (3, 3), color="blue").save(stream, format=image_format)
        return SimpleUploadedFile(name, stream.getvalue(), content_type=content_type)

    def create_catalogue(self, **changes):
        payload = {"title": "Exterior paints", "file": self.pdf()}
        payload.update(changes)
        result = self.client.post(self.list_url, payload, format="multipart")
        self.assertEqual(result.status_code, 201, result.data)
        return result.data

    def detail_url(self, catalogue):
        return reverse("catalogue-detail", args=[catalogue["id"]])

    def replace(self, catalogue, **changes):
        payload = {"file": self.pdf(width=144), "expected_version": catalogue["current_version"]["id"]}
        payload.update(changes)
        return self.client.post(reverse("catalogue-version-create", args=[catalogue["id"]]), payload, format="multipart")

    def download_url(self, catalogue, version=None):
        return reverse("catalogue-version-file", args=[catalogue["id"], (version or catalogue["current_version"])["id"]])

    def download(self, url):
        response = self.client.get(url)
        self.assertEqual(response.status_code, 200)
        try:
            return b"".join(response.streaming_content)
        finally:
            response.close()

    def send(self, catalogue, key="catalogue-send-1", **changes):
        payload = {"catalogue_version_ids": [catalogue["current_version"]["id"]], "catalogue_send_key": key}
        payload.update(changes)
        return self.client.post(self.messages_url, payload, format="json")

    def test_valid_types_defaults_and_private_download_contract(self):
        uploads = [self.pdf("../../paint.pdf"), self.image("JPEG", "paint.jpg", "image/jpeg"),
                   self.image("PNG", "paint.png", "image/png"), self.image("WEBP", "paint.webp", "image/webp")]
        for uploaded in uploads:
            with self.subTest(name=uploaded.name):
                catalogue = self.create_catalogue(file=uploaded)
                self.assertEqual(catalogue["category"], "Other")
                self.assertEqual(catalogue["document_type"], "PRODUCT_CATALOGUE")
                version = CatalogueVersion.objects.get(pk=catalogue["current_version"]["id"])
                self.assertTrue(Path(version.file.path).is_relative_to(self.private))
                self.assertFalse(Path(version.file.path).is_relative_to(self.media))
                self.assertNotIn("..", version.file_name)
                self.assertNotIn("/", version.file_name)
                with self.assertRaises(ValueError):
                    _ = version.file.url
                self.assertEqual(catalogue["current_version"]["file_url"], f"/quotations/catalogues/{catalogue['id']}/versions/{version.pk}/file/")
                self.assertNotIn("/media/", str(catalogue))
                self.assertNotIn(str(self.private), str(catalogue))
                self.assertEqual(len(self.download(self.download_url(catalogue))), version.size)

    def test_invalid_empty_oversized_spoofed_truncated_and_encrypted_uploads_leave_no_rows(self):
        cases = [
            SimpleUploadedFile("empty.pdf", b"", "application/pdf"),
            SimpleUploadedFile("large.pdf", b"x" * (MAX_CATALOGUE_BYTES + 1), "application/pdf"),
            SimpleUploadedFile("fake.pdf", b"%PDF-not-a-document", "application/pdf"),
            SimpleUploadedFile("fake.jpg", b"not-an-image", "image/jpeg"),
            SimpleUploadedFile("fake.svg", b"<svg/>", "image/svg+xml"),
            self.pdf(encrypted=True),
        ]
        png = self.image("PNG", "wrong.jpg", "image/jpeg")
        cases.append(png)
        cases.append(SimpleUploadedFile("wrong-mime.pdf", self.pdf().read(), "image/png"))
        jpeg = self.image("JPEG", "truncated.jpg", "image/jpeg").read()
        cases.append(SimpleUploadedFile("truncated.jpg", jpeg[:len(jpeg) // 2], "image/jpeg"))
        for upload in cases:
            with self.subTest(name=upload.name):
                response = self.client.post(self.list_url, {"title": "Invalid", "file": upload}, format="multipart")
                self.assertEqual(response.status_code, 400, response.data)
                self.assertFalse(ContractorCatalogue.objects.exists())
                self.assertFalse(CatalogueVersion.objects.exists())
        self.assertFalse(any(path.is_file() for path in self.private.rglob("*")))
        for payload in ({"title": "Missing file"}, {"file": self.pdf()}, {"title": "   ", "file": self.pdf()}):
            self.assertEqual(self.client.post(self.list_url, payload, format="multipart").status_code, 400)

    def test_every_library_endpoint_is_owner_scoped_and_contractor_only(self):
        catalogue = self.create_catalogue()
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(self.list_url).data["results"], [])
        self.assertEqual(self.client.get(self.detail_url(catalogue)).status_code, 404)
        self.assertEqual(self.client.patch(self.detail_url(catalogue), {"title": "Stolen"}, format="json").status_code, 404)
        self.assertEqual(self.replace(catalogue).status_code, 404)
        self.assertEqual(self.client.get(self.download_url(catalogue)).status_code, 404)
        for user in (self.portal, self.painter, self.admin):
            self.client.force_authenticate(user)
            self.assertEqual(self.client.get(self.list_url).status_code, 403)
            self.assertEqual(self.client.get(self.download_url(catalogue)).status_code, 403)
        self.owner.is_active = False
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.get(self.list_url).status_code, 403)
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.download_url(catalogue)).status_code, 401)

    def test_related_master_items_allow_global_admin_and_own_but_reject_other_and_inactive(self):
        for creator in (None, self.admin, self.owner):
            category = ServiceCategory.objects.create(name=f"Allowed {creator.pk if creator else 'global'}", created_by=creator)
            product = PaintType.objects.create(name=f"Paint {category.pk}", created_by=creator, service_category=category)
            catalogue = self.create_catalogue(service_category=category.pk, product=product.pk)
            self.assertEqual(catalogue["service_category"], category.pk)
            self.assertEqual(catalogue["product"], product.pk)
        for model, field in ((ServiceCategory, "service_category"), (PaintType, "product")):
            forbidden = model.objects.create(name="Other contractor", created_by=self.other)
            inactive = model.objects.create(name="Inactive own", created_by=self.owner, is_active=False)
            for row in (forbidden, inactive):
                response = self.client.post(self.list_url, {"title": "Denied", "file": self.pdf(), field: row.pk}, format="multipart")
                self.assertEqual(response.status_code, 400, response.data)
                self.assertEqual(self.client.patch(self.detail_url(catalogue), {field: row.pk}, format="json").status_code, 400)

    def test_replace_keeps_old_bytes_and_rejects_stale_expected_version(self):
        original = self.create_catalogue()
        old_bytes = self.download(self.download_url(original))
        changed = self.replace(original)
        self.assertEqual(changed.status_code, 201, changed.data)
        self.assertEqual(changed.data["current_version"]["version"], 2)
        self.assertNotEqual(changed.data["current_version"]["id"], original["current_version"]["id"])
        self.assertEqual(self.download(self.download_url(original)), old_bytes)
        self.assertNotEqual(self.download(self.download_url(changed.data)), old_bytes)
        self.assertEqual(self.replace(original).status_code, 409)
        self.assertEqual(CatalogueVersion.objects.filter(catalogue_id=original["id"]).count(), 2)

    def test_metadata_filters_are_scoped_and_do_not_replace_the_file(self):
        catalogue = self.create_catalogue(category="Walls", brand_vendor="Acme", document_type="BROCHURE")
        original_version = catalogue["current_version"]
        self.create_catalogue(title="Portfolio", category="Interiors", document_type="OUR_WORK")
        self.client.force_authenticate(self.other)
        self.create_catalogue(title="Private outsider", category="Secret")
        self.client.force_authenticate(self.owner)
        filtered = self.client.get(self.list_url, {"search": "Acme", "category": "Walls", "document_type": "BROCHURE"})
        self.assertEqual([row["id"] for row in filtered.data["results"]], [catalogue["id"]])
        self.assertEqual(set(filtered.data["categories"]), {"Walls", "Interiors"})
        updated = self.client.patch(self.detail_url(catalogue), {"title": "Renamed", "description": "Private notes", "category": ""}, format="json")
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.data["category"], "Other")
        self.assertEqual(updated.data["current_version"], original_version)
        self.assertEqual(self.client.get(self.list_url, {"document_type": "INVALID"}).status_code, 400)
        self.assertEqual(self.client.get(self.list_url, {"archived": "all"}).status_code, 400)

    def test_archive_filters_restore_and_strict_boolean_preserve_file_history(self):
        catalogue = self.create_catalogue(category="Walls")
        self.assertEqual(self.client.patch(self.detail_url(catalogue), {"is_archived": "false"}, format="json").status_code, 400)
        archived = self.client.patch(self.detail_url(catalogue), {"is_archived": True}, format="json")
        self.assertEqual(archived.status_code, 200, archived.data)
        self.assertEqual(self.client.get(self.list_url).data["results"], [])
        saved = self.client.get(self.list_url, {"archived": "1"}).data
        self.assertEqual([row["id"] for row in saved["results"]], [catalogue["id"]])
        self.assertEqual(saved["categories"], ["Walls"])
        self.assertEqual(self.replace(catalogue).status_code, 409)
        self.assertEqual(self.send(catalogue).status_code, 409)
        self.assertTrue(self.download(self.download_url(catalogue)))
        restored = self.client.patch(self.detail_url(catalogue), {"is_archived": False}, format="json")
        self.assertEqual(restored.status_code, 200, restored.data)
        self.assertEqual(restored.data["current_version"], catalogue["current_version"])
        self.assertEqual(self.send(catalogue).status_code, 201)

    def test_database_failure_rolls_back_rows_and_cleans_completed_upload(self):
        with patch.object(CatalogueVersion, "save", side_effect=RuntimeError("DB write failed")):
            with self.assertRaisesRegex(RuntimeError, "DB write failed"):
                self.client.post(self.list_url, {"title": "Rollback", "file": self.pdf()}, format="multipart")
        self.assertFalse(ContractorCatalogue.objects.exists())
        self.assertFalse(CatalogueVersion.objects.exists())
        self.assertFalse(any(path.is_file() for path in self.private.rglob("*")))

    def test_storage_cleans_stream_failure_before_field_save_returns(self):
        class InterruptedUpload(ContentFile):
            def chunks(self, chunk_size=None):
                yield b"partial private bytes"
                raise OSError("Stream interrupted")

        storage = PrivateCatalogueStorage()
        with self.assertRaisesRegex(OSError, "Stream interrupted"):
            storage.save("catalogues/1/interrupted", InterruptedUpload(b"ignored"))
        self.assertFalse((self.private / "catalogues/1/interrupted").exists())
        with override_settings(PRIVATE_CATALOGUE_ROOT=self.media / "publicly-visible"):
            with self.assertRaises(ImproperlyConfigured):
                PrivateCatalogueStorage()

    def test_share_retries_are_idempotent_and_changed_payload_conflicts(self):
        catalogue = self.create_catalogue()
        sent = self.send(catalogue)
        self.assertEqual(sent.status_code, 201, sent.data)
        again = self.send(catalogue)
        self.assertEqual(again.status_code, 200, again.data)
        self.assertEqual(sent.data["id"], again.data["id"])
        self.assertEqual(ChatMessage.objects.filter(catalogue_send_key="catalogue-send-1").count(), 1)
        self.assertEqual(ChatAttachment.objects.filter(message_id=sent.data["id"]).count(), 1)
        self.assertEqual(self.send(catalogue, text="Changed message").status_code, 409)
        self.assertEqual(self.replace(catalogue).status_code, 201)
        # A retry of an already accepted send remains the same immutable message.
        self.assertEqual(self.send(catalogue).data["id"], sent.data["id"])
        self.assertEqual(self.send(catalogue, key="fresh-stale-selection").status_code, 409)

    def test_sent_snapshot_survives_replace_archive_and_message_delete_keeps_library_bytes(self):
        catalogue = self.create_catalogue()
        initial_bytes = self.download(self.download_url(catalogue))
        sent = self.send(catalogue)
        self.assertEqual(sent.status_code, 201, sent.data)
        attachment = ChatAttachment.objects.get(message_id=sent.data["id"])
        self.assertFalse(attachment.file)
        self.assertEqual(attachment.catalogue_version_id, catalogue["current_version"]["id"])
        self.assertEqual(self.replace(catalogue).status_code, 201)
        self.client.patch(self.detail_url(catalogue), {"is_archived": True, "title": "Renamed after sending"}, format="json")
        self.client.force_authenticate(self.portal)
        self.assertEqual(self.download(reverse("chat-attachment-download", args=[attachment.pk])), initial_bytes)
        self.assertNotIn("Renamed", self.client.get(self.messages_url).data[0]["attachments"][0]["name"])
        self.assertEqual(self.client.get(self.download_url(catalogue)).status_code, 403)
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(reverse("chat-attachment-download", args=[attachment.pk])).status_code, 404)
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.client.delete(reverse("chat-message-detail", args=[sent.data["id"]])).status_code, 204)
        self.assertFalse(ChatAttachment.objects.filter(pk=attachment.pk).exists())
        self.assertEqual(self.download(self.download_url(catalogue)), initial_bytes)
        self.assertEqual(self.send(catalogue).status_code, 409)

    def test_combined_attachment_limit_and_duplicate_catalogue_selection_create_no_message(self):
        catalogue = self.create_catalogue()
        identifier = catalogue["current_version"]["id"]
        self.assertEqual(self.send(catalogue, catalogue_version_ids=[identifier, identifier]).status_code, 400)
        self.assertEqual(self.send(catalogue, catalogue_version_ids=list(range(1, 7))).status_code, 400)
        payload = {"catalogue_version_ids": [identifier], "catalogue_send_key": "too-many-files", "files": [self.pdf(f"extra-{index}.pdf") for index in range(5)]}
        self.assertEqual(self.client.post(self.messages_url, payload, format="multipart").status_code, 400)
        self.assertFalse(ChatMessage.objects.exists())

    def test_sharing_rejects_foreign_version_wrong_role_and_restricted_recipient(self):
        self.client.force_authenticate(self.other)
        foreign = self.create_catalogue()
        self.client.force_authenticate(self.owner)
        self.assertEqual(self.send(foreign).status_code, 404)
        own = self.create_catalogue()
        self.client.force_authenticate(self.portal)
        self.assertEqual(self.send(own).status_code, 403)
        self.client.force_authenticate(self.owner)
        for state in ("PENDING", "REJECTED", "BLOCKED", "DISCONNECTED"):
            self.connection.status = state
            self.connection.save(update_fields=["status"])
            self.assertEqual(self.send(own, key=f"restricted-{state}").status_code, 404)
        self.connection.status = "CONNECTED"
        self.connection.save(update_fields=["status"])
        self.portal.is_active = False
        self.portal.save(update_fields=["is_active"])
        self.assertEqual(self.send(own, key="disabled-customer").status_code, 403)
        self.portal.is_active = True
        self.portal.save(update_fields=["is_active"])
        self.customer.status = "CANCELLED"
        self.customer.save(update_fields=["status"])
        self.assertEqual(self.send(own, key="cancelled-customer").status_code, 403)
        self.customer.status = "NEW"
        self.customer.save(update_fields=["status"])
        self.conversation.blocked_by = self.portal
        self.conversation.save(update_fields=["blocked_by"])
        self.assertEqual(self.send(own, key="blocked-conversation").status_code, 403)
        self.assertFalse(ChatMessage.objects.exists())
