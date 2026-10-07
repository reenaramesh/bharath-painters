# Email & OTP Setup

Run `python manage.py migrate`, then sign in to Django admin as an active
superuser and open Accounts → Email & OTP Setup. Ordinary staff and support
users cannot access setup, test actions or delivery logs.

Before storing provider credentials, generate a Fernet key:

```sh
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Set that value in the server environment as `EMAIL_SETUP_ENCRYPTION_KEY`.
Keep it stable across deployments and back it up separately from the database.
Changing it requires re-entering provider API keys. Never put it in frontend
environment variables. The API key input is write-only; leaving it blank retains
the existing encrypted value. Clear API key removes it. No API exposes setup.

Choose Django email / SMTP, Resend or SendGrid. Django delivery retains existing
SMTP environment settings. API providers use fixed HTTPS endpoints, a 15-second
timeout and no redirects. Configure and verify your sender domain with the
provider first. Activation validates sender, URLs, OTP settings and API-key
decryption; it does not verify DNS or guarantee inbox delivery.

Until the setup is activated, authentication keeps existing environment email
delivery and default OTP limits. Activating applies the saved sender and policy.
Frontend URL supplies the account-security link in OTP emails; backend URL
supplies newly generated profile QR links. Existing QR images are not regenerated.
These URLs do not alter CORS, trusted origins or allowed hosts.

Save before testing. Send Test Email can test inactive saved settings; Send Test
OTP requires activation and uses the ADMIN_TEST purpose on the requesting admin.
It is subject to the same resend and hourly limits, but cannot authorize login,
registration, activation or password recovery. GET never sends email; POST
requires admin authorization and CSRF protection. Codes are stored only as salted
Django password hashes with purpose, expiry and a per-challenge attempt limit.

Delivery logs show provider acceptance or a fixed failure code. Acceptance does
not confirm inbox receipt. Logs do not contain API keys, OTPs, message bodies,
provider responses or exception text. Use the provider dashboard for bounce and
delivery confirmation. No webhook delivery tracking is included.

Existing development-only OTP response behavior is preserved when configuration
is inactive and DEBUG uses a console or in-memory backend. Active configuration
suppresses those response codes. Production must use a real email backend.

The existing deployment checks still validate environment SMTP settings, so keep
those valid when running `check --deploy`, including when an API provider is
active. Provider credentials are independent of those environment SMTP values.

Validation:

```sh
python manage.py test accounts.test_email_setup accounts.tests quotations.test_customer_activation_invoices
python manage.py makemigrations --check --dry-run
```
