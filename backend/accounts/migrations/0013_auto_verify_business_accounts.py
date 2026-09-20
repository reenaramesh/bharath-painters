from django.db import migrations
from django.utils import timezone


def verify_existing_business_accounts(apps, schema_editor):
    User = apps.get_model("accounts", "BharathUser")
    now = timezone.now()
    prefixes = {"CONTRACTOR": "BP-C-", "PAINTER": "BP-P-"}
    users = User.objects.filter(role__in=prefixes).exclude(verification_status="SUSPENDED").order_by("id")
    for user in users.iterator():
        if not user.bharath_id:
            prefix = prefixes[user.role]
            serial = user.pk
            candidate = f"{prefix}{serial:06d}"
            while User.objects.exclude(pk=user.pk).filter(bharath_id=candidate).exists():
                serial += 1
                candidate = f"{prefix}{serial:06d}"
            user.bharath_id = candidate
        user.is_verified = True
        user.verification_status = "VERIFIED"
        user.verified_at = user.verified_at or now
        user.badge_issued_at = user.badge_issued_at or now
        user.save(update_fields=(
            "bharath_id", "is_verified", "verification_status",
            "verified_at", "badge_issued_at",
        ))


class Migration(migrations.Migration):
    dependencies = [("accounts", "0012_recovery_email_security")]
    operations = [migrations.RunPython(verify_existing_business_accounts, migrations.RunPython.noop)]
