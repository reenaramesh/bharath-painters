# Amazon SES recovery-email setup

The application sends password-recovery and recovery-email verification codes
through Django's SMTP backend. No AWS SDK is required.

## 1. Create the SES identity

1. Open Amazon SES in the **Asia Pacific (Mumbai) / ap-south-1** region.
2. Add the application's sending domain as a verified identity.
3. Enable Easy DKIM and publish the SES-provided CNAME records in the domain's DNS.
4. Wait until the identity and DKIM status are verified.
5. Use a sender such as `no-reply@bharathpainters.in`.

The domain/email used by `DEFAULT_FROM_EMAIL` must be verified in the same SES
region used by the SMTP credentials.

## 2. Request production access

New SES accounts are placed in the sandbox. In the sandbox, mail can only be
sent to verified recipients. Request production access in SES before enabling
password recovery for real users.

Use **Transactional** as the mail type and explain that the system sends
user-requested password recovery and email-verification OTPs. It does not send
marketing mail.

## 3. Create SES SMTP credentials

In SES, open **SMTP settings** and create SMTP credentials. SMTP credentials are
different from ordinary AWS access keys and are specific to the AWS region.

Store these values only in the deployment environment. Never commit them.

~~~env
EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend
EMAIL_HOST=email-smtp.ap-south-1.amazonaws.com
EMAIL_PORT=587
EMAIL_HOST_USER=YOUR_SES_SMTP_USERNAME
EMAIL_HOST_PASSWORD=YOUR_SES_SMTP_PASSWORD
EMAIL_USE_TLS=true
EMAIL_USE_SSL=false
EMAIL_TIMEOUT=15
DEFAULT_FROM_EMAIL=Bharath Painters <no-reply@bharathpainters.in>
~~~

Restart the backend after changing environment variables.

## 4. Verify the configuration

Run the production checks:

~~~powershell
python manage.py check --deploy --tag security
~~~

Send a non-sensitive delivery test:

~~~powershell
python manage.py test_recovery_email --to your-verified-test@example.com
~~~

While SES remains in the sandbox, the recipient used for this test must also be
verified in SES.

## 5. Test the complete user flow

1. Add and verify a recovery email on a test Customer, Contractor or Painter.
2. Sign out and open **Forgot password**.
3. Enter the registered mobile number and select the correct role.
4. Send the OTP and confirm that the masked recovery email is shown.
5. Verify the OTP, set a new password and sign in.

OTP codes are stored as password hashes, expire after the configured interval,
have resend/hour limits, and are invalidated after a successful password reset.
