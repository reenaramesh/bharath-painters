"""Owner-only private catalogue library and immutable version downloads."""
from io import BytesIO
from pathlib import PurePosixPath
import logging
import warnings

from django.db import transaction
from django.db.models import Q
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from django.utils.text import get_valid_filename
from rest_framework import serializers, status
from rest_framework.exceptions import APIException, PermissionDenied, ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import CatalogueVersion, ContractorCatalogue, PaintType, ServiceCategory


logger = logging.getLogger(__name__)
MAX_CATALOGUE_BYTES = 10 * 1024 * 1024
CONTENT_TYPES = {".pdf": "application/pdf", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp"}


class CatalogueConflict(APIException):
    status_code = status.HTTP_409_CONFLICT
    default_detail = "This catalogue changed. Refresh it before replacing the file."


def catalogue_version_data(version):
    if version is None:
        return None
    return {
        "id": version.pk, "version": version.version, "file_name": version.file_name,
        "content_type": version.content_type, "size": version.size,
        "file_url": f"/quotations/catalogues/{version.catalogue_id}/versions/{version.pk}/file/",
        "created_at": version.created_at.isoformat(),
    }


def catalogue_data(catalogue):
    return {
        "id": catalogue.pk, "title": catalogue.title, "category": catalogue.category,
        "brand_vendor": catalogue.brand_vendor, "description": catalogue.description,
        "document_type": catalogue.document_type, "service_category": catalogue.service_category_id,
        "product": catalogue.product_id, "is_archived": catalogue.is_archived,
        "created_at": catalogue.created_at.isoformat(), "updated_at": catalogue.updated_at.isoformat(),
        "current_version": catalogue_version_data(catalogue.current_version),
    }


def permitted_master_rows(model, user):
    return model.objects.filter(
        Q(created_by__isnull=True) | Q(created_by__role="ADMIN") | Q(created_by=user),
        is_active=True,
    )


class CatalogueMetadata(serializers.Serializer):
    title = serializers.CharField(max_length=180)
    category = serializers.CharField(max_length=100, default="Other", allow_blank=True)
    brand_vendor = serializers.CharField(max_length=160, default="", allow_blank=True)
    description = serializers.CharField(default="", allow_blank=True)
    document_type = serializers.ChoiceField(choices=ContractorCatalogue.DocumentType.choices, default=ContractorCatalogue.DocumentType.PRODUCT_CATALOGUE)
    service_category = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    product = serializers.IntegerField(min_value=1, required=False, allow_null=True)
    is_archived = serializers.BooleanField(required=False)

    def validate_category(self, value):
        return value or "Other"

    def validate_is_archived(self, value):
        if not isinstance(self.initial_data.get("is_archived"), bool):
            raise serializers.ValidationError("Use a JSON boolean.")
        return value

    def validate(self, attrs):
        for field, model in (("service_category", ServiceCategory), ("product", PaintType)):
            if field in attrs:
                identifier = attrs[field]
                if identifier is not None and not permitted_master_rows(model, self.context["user"]).filter(pk=identifier).exists():
                    raise serializers.ValidationError({field: "Select an active item from your catalogue."})
                attrs[f"{field}_id"] = attrs.pop(field)
        return attrs


def metadata(request, *, partial=False):
    permitted = set(CatalogueMetadata().fields)
    if not partial:
        permitted.discard("is_archived")
        permitted.add("file")
    if set(request.data) - permitted:
        raise ValidationError({"detail": "Unsupported catalogue fields."})
    values = {key: request.data[key] for key in request.data if key != "file"}
    # An empty optional multipart relationship means no link.
    for key in ("service_category", "product"):
        if key in values and values[key] == "":
            values[key] = None
    serializer = CatalogueMetadata(data=values, partial=partial, context={"user": request.user})
    serializer.is_valid(raise_exception=True)
    return serializer.validated_data


def validate_catalogue_file(upload):
    if upload is None:
        raise ValidationError({"file": "Choose a PDF, JPG, PNG or WebP file."})
    if getattr(upload, "size", 0) <= 0:
        raise ValidationError({"file": "The file is empty."})
    if upload.size > MAX_CATALOGUE_BYTES:
        raise ValidationError({"file": "The file must be 10 MiB or smaller."})
    name = PurePosixPath(str(upload.name).replace("\\", "/")).name
    try:
        name = get_valid_filename(name)
    except Exception as exc:
        raise ValidationError({"file": "Choose a file with a valid name."}) from exc
    extension = PurePosixPath(name).suffix.lower()
    canonical_type = CONTENT_TYPES.get(extension)
    if not canonical_type:
        raise ValidationError({"file": "Only PDF, JPG, PNG and WebP files are supported."})
    supplied_type = (getattr(upload, "content_type", "") or "").split(";", 1)[0].strip().lower()
    if supplied_type not in ("", "application/octet-stream", canonical_type):
        raise ValidationError({"file": "The file type does not match its extension."})
    # Inspect a bounded independent stream, then leave the uploaded stream ready for storage.
    try:
        upload.seek(0)
        content = upload.read(MAX_CATALOGUE_BYTES + 1)
    finally:
        upload.seek(0)
    if not content or len(content) > MAX_CATALOGUE_BYTES:
        raise ValidationError({"file": "The file must contain between 1 byte and 10 MiB."})
    try:
        if extension == ".pdf":
            from pypdf import PdfReader
            reader = PdfReader(BytesIO(content), strict=True)
            if reader.is_encrypted or len(reader.pages) == 0:
                raise ValueError("Encrypted or empty PDF")
        else:
            try:
                from PIL import Image
            except ImportError as exc:
                # Fail closed: signatures alone do not establish a valid image.
                raise ValidationError({"file": "Image verification is unavailable. Please upload a PDF."}) from exc
            expected_format = {".jpg": "JPEG", ".jpeg": "JPEG", ".png": "PNG", ".webp": "WEBP"}[extension]
            with warnings.catch_warnings():
                warnings.simplefilter("error", Image.DecompressionBombWarning)
                with Image.open(BytesIO(content)) as image:
                    if image.format != expected_format:
                        raise ValueError("Image format mismatch")
                    image.verify()
                # verify() does not decode every format; load to reject truncated JPEG/WebP data.
                with Image.open(BytesIO(content)) as image:
                    image.load()
    except ValidationError:
        raise
    except Exception as exc:
        raise ValidationError({"file": "Upload a valid, unencrypted PDF or a valid JPG, PNG or WebP image."}) from exc
    # Preserve the extension when reducing a long, sanitized basename.
    name = name[:255 - len(extension)] + extension if len(name) > 255 else name
    return {"file_name": name, "content_type": canonical_type, "size": len(content)}


def create_version(catalogue, upload, file_metadata, number):
    """Caller holds the catalogue row lock (or created it in this transaction)."""
    version = CatalogueVersion(catalogue=catalogue, version=number, **file_metadata)
    # Persist the private file separately so a DB failure can clean it up.
    version.file.save(file_metadata["file_name"], upload, save=False)
    return version


def remove_failed_upload(version):
    if version is not None and version.file.name:
        try:
            version.file.storage.delete(version.file.name)
        except Exception:
            logger.exception("Could not remove a failed private catalogue upload")


class ContractorCatalogueView(APIView):
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.user.role != "CONTRACTOR" or not request.user.is_active:
            raise PermissionDenied("Contractor access only.")

    def owned(self, request, *, lock=False):
        rows = ContractorCatalogue.objects.filter(contractor=request.user)
        if lock:
            return rows.select_for_update(of=("self",))
        return rows.select_related("current_version")


class CatalogueListCreateView(ContractorCatalogueView):
    def get(self, request):
        archived = request.query_params.get("archived", "0")
        if archived not in ("0", "1"):
            raise ValidationError({"archived": "Use 0 or 1."})
        rows = self.owned(request).filter(is_archived=archived == "1")
        categories = list(rows.order_by("category").values_list("category", flat=True).distinct())
        search = request.query_params.get("search", "").strip()
        if search:
            rows = rows.filter(Q(title__icontains=search) | Q(brand_vendor__icontains=search) | Q(description__icontains=search) | Q(category__icontains=search))
        if request.query_params.get("category"):
            rows = rows.filter(category=request.query_params["category"])
        document_type = request.query_params.get("document_type")
        if document_type:
            if document_type not in ContractorCatalogue.DocumentType.values:
                raise ValidationError({"document_type": "Select a valid document type."})
            rows = rows.filter(document_type=document_type)
        return Response({"results": [catalogue_data(row) for row in rows], "categories": categories})

    def post(self, request):
        values = metadata(request)
        upload = request.FILES.get("file")
        file_metadata = validate_catalogue_file(upload)
        version = None
        try:
            with transaction.atomic():
                catalogue = ContractorCatalogue.objects.create(contractor=request.user, **values)
                version = create_version(catalogue, upload, file_metadata, 1)
                version.save(force_insert=True)
                catalogue.current_version = version
                catalogue.save(update_fields=("current_version", "updated_at"))
                data = catalogue_data(catalogue)
        except Exception:
            remove_failed_upload(version)
            raise
        return Response(data, status=status.HTTP_201_CREATED)


class CatalogueDetailView(ContractorCatalogueView):
    def get(self, request, pk):
        return Response(catalogue_data(get_object_or_404(self.owned(request), pk=pk)))

    def patch(self, request, pk):
        values = metadata(request, partial=True)
        with transaction.atomic():
            catalogue = get_object_or_404(self.owned(request, lock=True), pk=pk)
            for key, value in values.items():
                setattr(catalogue, key, value)
            if values:
                catalogue.save(update_fields=tuple(values) + ("updated_at",))
            data = catalogue_data(catalogue)
        return Response(data)


class CatalogueVersionCreateView(ContractorCatalogueView):
    def post(self, request, pk):
        if set(request.data) - {"file", "expected_version"}:
            raise ValidationError({"detail": "Only file and expected_version are supported."})
        expected = serializers.IntegerField(min_value=1).run_validation(request.data.get("expected_version"))
        # Resolve ownership before inspecting an upload or disclosing current version information.
        get_object_or_404(self.owned(request), pk=pk)
        upload = request.FILES.get("file")
        file_metadata = validate_catalogue_file(upload)
        version = None
        try:
            with transaction.atomic():
                catalogue = get_object_or_404(self.owned(request, lock=True), pk=pk)
                if catalogue.is_archived:
                    raise CatalogueConflict("Restore this catalogue before replacing its file.")
                if catalogue.current_version_id != expected:
                    raise CatalogueConflict()
                previous = catalogue.current_version
                version = create_version(catalogue, upload, file_metadata, previous.version + 1)
                version.save(force_insert=True)
                catalogue.current_version = version
                catalogue.save(update_fields=("current_version", "updated_at"))
                data = catalogue_data(catalogue)
        except Exception:
            remove_failed_upload(version)
            raise
        return Response(data, status=status.HTTP_201_CREATED)


class CatalogueVersionFileView(ContractorCatalogueView):
    def get(self, request, pk, version_id):
        version = get_object_or_404(CatalogueVersion.objects.filter(catalogue__contractor=request.user, catalogue_id=pk), pk=version_id)
        try:
            stream = version.file.open("rb")
        except OSError as exc:
            raise Http404("Catalogue file not found.") from exc
        response = FileResponse(stream, as_attachment=True, filename=version.file_name, content_type=version.content_type)
        response["Cache-Control"] = "private, no-store"
        response["X-Content-Type-Options"] = "nosniff"
        return response
