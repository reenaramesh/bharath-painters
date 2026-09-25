from django.contrib import admin
from django.utils import timezone

from .models import (
    BharathUser,
    PainterProfile,
    ContractorProfile,
    UserLegalConsent,
)

from .utils import generate_bharath_qr


@admin.register(UserLegalConsent)
class UserLegalConsentAdmin(admin.ModelAdmin):
    list_display = ("user", "role_at_acceptance", "policy_version", "accepted_at", "ip_address")
    list_filter = ("role_at_acceptance", "policy_version", "accepted_at")
    search_fields = ("user__mobile", "user__email", "policy_version", "ip_address")
    readonly_fields = (
        "user", "policy_version", "role_at_acceptance", "terms_hash", "privacy_hash",
        "terms_accepted", "privacy_notice_acknowledged", "document_scrolled",
        "acceptance_method", "ip_address", "user_agent", "accepted_at",
    )


@admin.register(BharathUser)
class BharathUserAdmin(admin.ModelAdmin):

    list_display = (
        "mobile",
        "email",
        "recovery_email",
        "recovery_email_verified",
        "role",
        "verification_status",
        "is_verified",
        "bharath_id",
        "verified_at",
        "badge_issued_at",
        "is_active",
    )

    list_filter = (
        "role",
        "verification_status",
        "is_verified",
        "recovery_email_verified",
        "is_active",
    )

    search_fields = (
        "mobile",
        "email",
        "recovery_email",
        "first_name",
        "last_name",
        "bharath_id",
    )

    readonly_fields = (
        "verification_status",
        "is_verified",
        "verified_at",
        "badge_issued_at",
        "created_at",
        "updated_at",
        "bharath_id",
        "bharath_qr",
        "recovery_email_verified_at",
        "recovery_email_added_at",
    )

    fieldsets = (
        (
            "Basic Information",
            {
                "fields": (
                    "mobile",
                    "email",
                    "recovery_email",
                    "recovery_email_verified",
                    "recovery_email_verified_at",
                    "recovery_email_added_at",
                    "recovery_email_added_by",
                    "first_name",
                    "last_name",
                    "profile_photo",
                    "role",
                )
            }
        ),

        (
            "Verification",
            {
                "fields": (
                    "verification_status",
                    "is_verified",
                    "bharath_id",
                    "bharath_qr",
                    "verified_at",
                    "badge_issued_at",
                )
            }
        ),

        (
            "Permissions",
            {
                "fields": (
                    "is_active",
                    "is_staff",
                    "is_superuser",
                    "groups",
                    "user_permissions",
                )
            }
        ),

        (
            "Dates",
            {
                "fields": (
                    "created_at",
                    "updated_at",
                    "last_login",
                )
            }
        ),
    )

    actions = [
        "issue_badges",
    ]

    # ---------------------------------------------------------
    # APPROVE & VERIFY
    # ---------------------------------------------------------

    @admin.action(description="Approve & Verify selected users")
    def approve_users(self, request, queryset):

        verified_count = 0

        for user in queryset:

            # Only Painter and Contractor receive badges
            if user.role == BharathUser.Roles.PAINTER:
                prefix = "BP-P-"

            elif user.role == BharathUser.Roles.CONTRACTOR:
                prefix = "BP-C-"

            else:
                continue

            # If user already has a Bharath ID,
            # keep the existing ID.
            if not user.bharath_id:

                existing_ids = (
                    BharathUser.objects
                    .filter(
                        role=user.role,
                        bharath_id__startswith=prefix
                    )
                    .exclude(pk=user.pk)
                    .values_list(
                        "bharath_id",
                        flat=True
                    )
                )

                highest_number = 0

                for existing_id in existing_ids:

                    if not existing_id:
                        continue

                    try:
                        number = int(
                            existing_id.replace(
                                prefix,
                                ""
                            )
                        )

                        highest_number = max(
                            highest_number,
                            number
                        )

                    except (
                        ValueError,
                        TypeError
                    ):
                        continue

                user.bharath_id = (
                    f"{prefix}{highest_number + 1:06d}"
                )

            # Verification timestamp
            now = timezone.now()

            user.verification_status = (
                BharathUser.VerificationStatus.VERIFIED
            )

            user.is_verified = True

            user.verified_at = now

            user.badge_issued_at = now

            # Generate QR
            generate_bharath_qr(user)

            # Save user + QR
            user.save()

            verified_count += 1

        self.message_user(
            request,
            f"{verified_count} user(s) "
            f"verified and badge issued successfully."
        )

    # ---------------------------------------------------------
    # ISSUE / REPAIR BADGE
    # ---------------------------------------------------------

    @admin.action(
        description="Issue / Repair Bharath Badge"
    )
    def issue_badges(self, request, queryset):

        issued_count = 0

        for user in queryset:

            # Only Painter and Contractor
            if user.role == BharathUser.Roles.PAINTER:
                prefix = "BP-P-"

            elif user.role == BharathUser.Roles.CONTRACTOR:
                prefix = "BP-C-"

            else:
                continue

            # ---------------------------------------------
            # Generate Bharath ID if missing
            # ---------------------------------------------

            if not user.bharath_id:

                existing_ids = (
                    BharathUser.objects
                    .filter(
                        role=user.role,
                        bharath_id__startswith=prefix
                    )
                    .exclude(pk=user.pk)
                    .values_list(
                        "bharath_id",
                        flat=True
                    )
                )

                highest_number = 0

                for existing_id in existing_ids:

                    if not existing_id:
                        continue

                    try:
                        number = int(
                            existing_id.replace(
                                prefix,
                                ""
                            )
                        )

                        highest_number = max(
                            highest_number,
                            number
                        )

                    except (
                        ValueError,
                        TypeError
                    ):
                        continue

                user.bharath_id = (
                    f"{prefix}{highest_number + 1:06d}"
                )

            # ---------------------------------------------
            # Verification dates
            # ---------------------------------------------

            now = timezone.now()

            if not user.verified_at:
                user.verified_at = now

            user.badge_issued_at = now

            # ---------------------------------------------
            # Generate / regenerate QR
            # ---------------------------------------------

            generate_bharath_qr(user)

            # ---------------------------------------------
            # Save everything
            # ---------------------------------------------

            user.save()

            issued_count += 1

        self.message_user(
            request,
            f"{issued_count} badge(s) "
            f"issued/repaired successfully."
        )

    # ---------------------------------------------------------
    # REJECT USERS
    # ---------------------------------------------------------

    @admin.action(description="Reject selected users")
    def reject_users(self, request, queryset):

        updated = queryset.update(
            verification_status=(
                BharathUser.VerificationStatus.REJECTED
            ),
            is_verified=False,
        )

        self.message_user(
            request,
            f"{updated} user(s) rejected."
        )


# =============================================================
# PAINTER PROFILE ADMIN
# =============================================================

@admin.register(PainterProfile)
class PainterProfileAdmin(admin.ModelAdmin):

    list_display = (
        "user",
        "experience_years",
        "daily_wage",
        "availability",
    )

    list_filter = (
        "availability",
    )

    search_fields = (
        "user__mobile",
        "user__first_name",
        "user__last_name",
    )


# =============================================================
# CONTRACTOR PROFILE ADMIN
# =============================================================

@admin.register(ContractorProfile)
class ContractorProfileAdmin(admin.ModelAdmin):

    list_display = (
        "company_name",
        "owner_name",
        "years_in_business",
        "number_of_painters",
    )

    search_fields = (
        "company_name",
        "owner_name",
        "user__mobile",
    )
