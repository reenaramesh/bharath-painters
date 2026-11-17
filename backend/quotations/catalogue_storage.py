"""Storage for immutable library files; deliberately has no public URL."""
from pathlib import Path
import os
from uuid import uuid4

from django.conf import settings
from django.core.exceptions import ImproperlyConfigured, SuspiciousFileOperation
from django.core.files.storage import FileSystemStorage
from django.utils.deconstruct import deconstructible
from django.utils.functional import cached_property


@deconstructible
class PrivateCatalogueStorage(FileSystemStorage):
    def __init__(self):
        self._private_location()
        super().__init__(base_url=None)

    @staticmethod
    def _private_location():
        location = Path(settings.PRIVATE_CATALOGUE_ROOT).resolve()
        media = Path(settings.MEDIA_ROOT).resolve()
        if location == media or media in location.parents:
            raise ImproperlyConfigured("PRIVATE_CATALOGUE_ROOT must be outside MEDIA_ROOT.")
        return str(location)

    @cached_property
    def base_location(self):
        return self._private_location()

    def _clear_cached_properties(self, setting, **kwargs):
        if setting == "PRIVATE_CATALOGUE_ROOT":
            self.__dict__.pop("base_location", None)
            self.__dict__.pop("location", None)
        super()._clear_cached_properties(setting, **kwargs)

    def path(self, name):
        target = Path(super().path(name)).resolve()
        root = Path(self.location).resolve()
        media = Path(settings.MEDIA_ROOT).resolve()
        if (target != root and root not in target.parents) or target == media or media in target.parents:
            raise SuspiciousFileOperation("Catalogue files must remain in private storage outside MEDIA_ROOT.")
        return str(target)

    def url(self, name):
        raise ValueError("Private catalogue files have no public URL.")

    def _save(self, name, content):
        # Own the exclusive create so even an interrupted/failed stream write is
        # removed here, before FieldFile.save() has returned a name to the view.
        target = Path(self.path(name))
        target.parent.mkdir(mode=self.directory_permissions_mode or 0o700, parents=True, exist_ok=True)
        descriptor = os.open(target, os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_BINARY", 0), self.file_permissions_mode or 0o600)
        try:
            with os.fdopen(descriptor, "wb") as destination:
                for chunk in content.chunks():
                    destination.write(chunk)
        except BaseException:
            try:
                target.unlink()
            except OSError:
                pass
            raise
        return str(name).replace("\\", "/")


def catalogue_upload_path(instance, filename):
    # The supplied basename is metadata only and never participates in a path.
    return f"catalogues/{instance.catalogue_id}/{uuid4().hex}"
