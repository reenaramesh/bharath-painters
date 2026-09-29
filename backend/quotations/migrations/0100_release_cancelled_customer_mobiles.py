from django.db import migrations


def release_cancelled_customer_mobiles(apps, schema_editor):
    Customer = apps.get_model("quotations", "Customer")
    Contact = apps.get_model("quotations", "SavedCustomerContact")
    ShareLink = apps.get_model("quotations", "CustomerShareLink")
    User = apps.get_model("accounts", "BharathUser")

    for customer in Customer.objects.filter(status="CANCELLED").iterator():
        marker = f"D{customer.pk}"
        Customer.objects.filter(pk=customer.pk).update(
            mobile=marker, normalized_mobile=marker, email="", whatsapp="", alternate_mobile="",
        )
        ShareLink.objects.filter(connection__customer_id=customer.pk).delete()
        for contact in Contact.objects.filter(customer_id=customer.pk).iterator():
            details = dict(contact.details or {})
            for key in ("mobile", "phone", "email", "whatsapp", "alternate_mobile"):
                details.pop(key, None)
            Contact.objects.filter(pk=contact.pk).update(details=details)

    # Earlier hard deletions left suspended login rows behind. Release those
    # numbers too, but keep accounts still attached to a live customer intact.
    for user in User.objects.filter(role="CUSTOMER", is_active=False, verification_status="SUSPENDED").iterator():
        if Customer.objects.filter(portal_user_id=user.pk).exclude(status="CANCELLED").exists():
            continue
        User.objects.filter(pk=user.pk).update(
            mobile=f"D{user.pk}", email="", recovery_email=None,
            recovery_email_verified=False, google_email="", google_subject=None,
        )


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0027_registration_email_otp_purposes"),
        ("quotations", "0099_connection_status_before_block"),
    ]

    operations = [migrations.RunPython(release_cancelled_customer_mobiles, migrations.RunPython.noop)]
