# Completed project address lookup

Contractors can paste a Google Maps **place** share link in **Completed Projects**, select **Fetch address**, review the result, then select **Use this address**. The name, site address, city and PIN remain editable before saving. The PIN is stored separately and appears on the digital card and its PDF.

To enable live lookup, sign in as an administrator and open **API Settings** in the sidebar. Paste a Google Maps key there. Enable **Places API (New)** and billing in the Google Cloud project, with key restrictions appropriate to the backend. The saved key is encrypted in the database and cannot be read back from the admin page. An existing server-side `GOOGLE_MAPS_API_KEY` environment variable remains a fallback when no admin key is saved. Never put the key in the frontend environment.

Run migrations `accounts.0029_completed_project_pincode` and `quotations.0102_platform_integration_secret` on the deployment database before using this feature. Keep `DJANGO_SECRET_KEY` stable across deployments; changing it makes the encrypted admin key unreadable, so the administrator would have to enter the key again. The API Settings page can replace or remove the saved key and records each change in the support audit log without recording the key value.

Some share links point only to a map pin or lack a postal code. In those cases the form keeps the existing manual entry fields. Google Maps may return a nearby place instead of the intended building, so the contractor must confirm the result before using it.
