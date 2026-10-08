# Shared profile images on Render

Checked 8 October 2026: the public page for `BP-C-000034` returned HTTP 200, but its owner photo, logo, project photo and stored QR URL all returned HTTP 404.

The shared page is rendered by `backend/accounts/templates/accounts/digital_card.html`, independently of the React dashboard card. Deploy the backend template changes to publish its updated alignment and remove its page/PDF language selectors. The dashboard changes alone do not update this page.

The QR now uses the existing public image endpoint with kind `qr`. It generates a PNG pointing at the public verification page without saving a file or changing the database. Owner, logo and project photographs still need their uploaded files in media storage.

## Check storage before restoring images

The project uses Django `FileSystemStorage`. Its `MEDIA_ROOT` already reads `DJANGO_MEDIA_ROOT`. Render's default filesystem is ephemeral: uploads outside a persistent disk disappear when the service restarts or redeploys. The observed photo failures are consistent with missing files, but the live disk configuration has not been inspected.

1. In the Render service Shell, check the effective media path and whether the referenced files exist. Back up any surviving uploads before changing mount paths or redeploying.
2. Configure a persistent disk, for example mounted at `/var/data`, and set `DJANGO_MEDIA_ROOT=/var/data/media`. Persistent disks require a paid service. Alternatively, plan an external object-storage integration separately.
3. Restore the media directory from backup, preserving relative paths. If no backup exists, re-upload the profile photo, company logo and completed-project photos through the application after storage is configured.
4. Deploy the backend changes. Reopen the shared URL while signed out and check the returned owner, logo, project and QR image URLs for HTTP 200 with an image content type.
5. Restart/redeploy once and verify the restored photographs still load.

No live deployment, disk changes, database edits or upload restoration were performed during this fix.

Reference: [Render persistent disks](https://render.com/docs/disks).
