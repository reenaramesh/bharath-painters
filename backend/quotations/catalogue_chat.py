"""Private catalogue versions sent as immutable, conversation-authorized attachments."""
import hashlib
import json
import logging
import re
from pathlib import Path

from django.core.exceptions import SuspiciousFileOperation
from django.db import transaction
from django.utils.text import get_valid_filename
from rest_framework.exceptions import ValidationError
from rest_framework.response import Response

logger = logging.getLogger(__name__)


def version_ids(data):
    raw = data.getlist("catalogue_version_ids") if hasattr(data, "getlist") else data.get("catalogue_version_ids")
    if isinstance(raw, list) and len(raw) == 1 and isinstance(raw[0], str) and raw[0].startswith("["):
        try:
            raw = json.loads(raw[0])
        except (ValueError, TypeError):
            raw = None
    if not isinstance(raw, list) or not 1 <= len(raw) <= 5:
        raise ValidationError({"catalogue_version_ids": "Choose between one and five catalogues."})
    result = []
    for value in raw:
        if isinstance(value, bool) or not re.fullmatch(r"[1-9][0-9]{0,18}", str(value)):
            raise ValidationError({"catalogue_version_ids": "Choose valid catalogues."})
        result.append(int(value))
    if len(set(result)) != len(result):
        raise ValidationError({"catalogue_version_ids": "Choose each catalogue once."})
    return result


def fingerprint(ids, text, reply, files):
    uploads = []
    for uploaded in files:
        digest = hashlib.sha256()
        for chunk in uploaded.chunks():
            digest.update(chunk)
        uploaded.seek(0)
        uploads.append([Path(uploaded.name.replace("\\", "/")).name, uploaded.size, digest.hexdigest()])
    body = {"versions": ids, "text": text, "reply": str(reply or ""), "files": uploads}
    return hashlib.sha256(json.dumps(body, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def create_catalogue_message(request, pk):
    from .models import CatalogueVersion, ChatAttachment, ChatConversation, ChatMessage, ContractorCatalogue, ContractorCustomerConnection, Customer
    from .views import ChatMessageListCreateView, chat_message_data, create_notification, validate_chat_files, validate_chat_text

    if request.user.role != "CONTRACTOR" or not request.user.is_active:
        return Response({"detail": "Contractor access only."}, status=403)
    ids = version_ids(request.data)
    key = request.data.get("catalogue_send_key")
    if not isinstance(key, str) or not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", key):
        raise ValidationError({"catalogue_send_key": "A valid catalogue send identifier is required."})
    if any(request.data.get(field) for field in ("contact_name", "contact_mobile", "colour_id", "colour_comparison")):
        raise ValidationError({"catalogue_version_ids": "Send catalogues separately from contacts and colours."})
    files = request.FILES.getlist("files")
    if len(files) + len(ids) > 5:
        raise ValidationError({"files": "Attach at most five files and catalogues combined."})
    error = validate_chat_files(files)
    if error:
        raise ValidationError({"files": error})
    text = str(request.data.get("text") or "").strip()
    reply_id = request.data.get("reply_to")
    signature = fingerprint(ids, text, reply_id, files)
    conversation = ChatMessageListCreateView().get_conversation(request, pk)
    if not conversation or conversation.contractor_id != request.user.pk or not conversation.customer_id:
        return Response({"detail": "Customer conversation not found."}, status=404)

    saved_files = []
    try:
        with transaction.atomic():
            # Match customer restriction writes before locking catalogue/conversation rows.
            customer = Customer.objects.select_for_update(of=("self",)).select_related("portal_user").get(pk=conversation.customer_id)
            connection = ContractorCustomerConnection.objects.select_for_update().filter(
                customer=customer, contractor=request.user, status="CONNECTED",
            ).first()
            if not connection or customer.status == "CANCELLED" or (
                customer.portal_user_id and (not customer.portal_user.is_active or customer.portal_user.role != "CUSTOMER")
            ):
                return Response({"detail": "This customer is unavailable for sharing."}, status=403)
            conversation = ChatConversation.objects.select_for_update(of=("self",)).select_related("customer").get(pk=conversation.pk)
            if conversation.blocked_by_id:
                return Response({"detail": "This conversation is blocked."}, status=403)
            previous = ChatMessage.objects.filter(conversation=conversation, sender=request.user, catalogue_send_key=key).first()
            if previous:
                if previous.catalogue_send_fingerprint != signature:
                    return Response({"detail": "This send identifier belongs to another message. Start a new send."}, status=409)
                if previous.deleted_at:
                    return Response({"detail": "This catalogue message was already deleted."}, status=409)
                return Response(chat_message_data(previous, request.user))

            versions = list(CatalogueVersion.objects.filter(pk__in=ids, catalogue__contractor=request.user).select_related("catalogue"))
            if len(versions) != len(ids):
                return Response({"catalogue_version_ids": "A selected catalogue is unavailable. Refresh your selection."}, status=404)
            catalogues = {row.pk: row for row in ContractorCatalogue.objects.select_for_update().filter(
                pk__in={version.catalogue_id for version in versions}, contractor=request.user,
            ).order_by("pk")}
            if any(catalogues[version.catalogue_id].is_archived or catalogues[version.catalogue_id].current_version_id != version.pk for version in versions):
                return Response({"catalogue_version_ids": "A selected catalogue was updated or archived. Refresh your selection before sending."}, status=409)
            text, failure = validate_chat_text(request, conversation, text, allow_empty=True)
            if failure:
                return failure
            reply = None
            if reply_id:
                if not re.fullmatch(r"[1-9][0-9]{0,18}", str(reply_id)):
                    raise ValidationError({"reply_to": "The message to reply to is unavailable."})
                reply = ChatMessage.objects.filter(pk=reply_id, conversation=conversation, deleted_at__isnull=True).first()
                if not reply:
                    raise ValidationError({"reply_to": "The message to reply to is unavailable."})
            message = ChatMessage.objects.create(
                conversation=conversation, sender=request.user, text=text, reply_to=reply,
                catalogue_send_key=key, catalogue_send_fingerprint=signature,
            )
            by_id = {version.pk: version for version in versions}
            for version_id in ids:
                version = by_id[version_id]
                try:
                    title = get_valid_filename(catalogues[version.catalogue_id].title)[:190]
                except SuspiciousFileOperation:
                    title = "catalogue"
                extension = Path(version.file_name).suffix.lower()
                filename = title if title.lower().endswith(extension) else title + extension
                ChatAttachment.objects.create(
                    message=message, catalogue_version=version, file="", file_name=filename,
                    content_type=version.content_type, size=version.size,
                )
            for uploaded in files:
                extension = Path(uploaded.name).suffix.lower()
                content_type = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".vcf": "text/vcard"}[extension]
                attachment = ChatAttachment(message=message, file=uploaded, file_name=Path(uploaded.name.replace("\\", "/")).name[:255], content_type=content_type, size=uploaded.size)
                try:
                    attachment.save()
                finally:
                    if attachment.file and attachment.file._committed:
                        saved_files.append((attachment.file.storage, attachment.file.name))
            conversation.save(update_fields=("updated_at",))

            def notify():
                try:
                    create_notification(customer.portal_user, "MESSAGE", "New message", "Open your inbox to view it.", "/messages", request.user)
                except Exception:
                    logger.exception("Catalogue message notification failed (message_id=%s)", message.pk)
            transaction.on_commit(notify)
            response = Response(chat_message_data(message, request.user), status=201)
        return response
    except Exception:
        for storage, name in saved_files:
            try:
                storage.delete(name)
            except OSError:
                logger.exception("Failed catalogue-message upload cleanup")
        raise
