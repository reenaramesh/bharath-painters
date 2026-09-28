# Background notifications

The notification bell can enable browser push alerts for each signed-in device. The browser asks permission only after the user presses **Enable**. New portal notifications are sent to subscribed devices even when the app is closed. Clicking an alert opens its linked page.

## Local development

Install backend dependencies from `backend/requirements.txt` and apply migration `quotations.0087_webpushsubscription`. The backend derives a stable VAPID key pair from its Django secret when no separate pair is configured. Open `http://localhost:5173`, sign in, open the notification bell, and press **Enable**. Chrome and Edge require notification permission for localhost.

## Production

Install the updated requirements and apply migration `quotations.0087_webpushsubscription` before users enable alerts. The existing production `DJANGO_SECRET_KEY` provides the stable VAPID pair. Keep that Django secret unchanged across deployments or existing device subscriptions will need to be renewed. Optionally, run `python manage.py generate_web_push_keys` once and add the three printed `WEB_PUSH_VAPID_*` values to the backend environment for a separate pair. Keep the private key secret and use the same pair on every backend instance.

Production web push requires HTTPS. On iPhone and iPad, users need to add the site to the Home Screen and enable alerts from that installed web app. Browser and operating system notification settings can also suppress delivery.
