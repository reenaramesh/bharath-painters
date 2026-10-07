from django import forms
from django.contrib import admin, messages
from django.core.exceptions import PermissionDenied, ValidationError
from django.shortcuts import get_object_or_404, redirect
from django.template.response import TemplateResponse
from django.urls import path, reverse
from django.utils.decorators import method_decorator
from django.views.decorators.debug import sensitive_post_parameters

from .email_setup import encrypt_api_key, send_configured_email
from .models import EmailOTPSetup, EmailDeliveryLog, PasswordResetOTP


class SetupForm(forms.ModelForm):
    api_key = forms.CharField(required=False, widget=forms.PasswordInput(render_value=False),
                              help_text="Leave blank to retain the stored key. Set EMAIL_SETUP_ENCRYPTION_KEY on the server first.")
    clear_api_key = forms.BooleanField(required=False)

    class Meta:
        model = EmailOTPSetup
        exclude = ("encrypted_api_key",)

    def clean(self):
        data = super().clean()
        if data.get("clear_api_key"):
            self.instance.encrypted_api_key = ""
        if data.get("api_key"):
            try:
                self.instance.encrypted_api_key = encrypt_api_key(data["api_key"])
            except Exception:
                self.add_error("api_key", "Configure a valid server encryption key before saving an API key.")
        return data


class SuperuserOnlyAdmin(admin.ModelAdmin):
    def has_module_permission(self, request):
        return request.user.is_active and request.user.is_superuser

    def has_view_permission(self, request, obj=None):
        return self.has_module_permission(request)

    def has_change_permission(self, request, obj=None):
        return self.has_module_permission(request)

    def has_add_permission(self, request):
        return self.has_module_permission(request)

    def has_delete_permission(self, request, obj=None):
        return False


class TestEmailForm(forms.Form):
    recipient = forms.EmailField()


@admin.register(EmailOTPSetup)
class EmailOTPSetupAdmin(SuperuserOnlyAdmin):
    form = SetupForm
    change_form_template = "admin/accounts/emailotpsetup/change_form.html"
    list_display = ("__str__", "provider", "is_active", "key_configured", "updated_at")
    readonly_fields = ("key_configured", "updated_at")
    fieldsets = (
        ("Provider and activation", {"fields": ("provider", "is_active", "key_configured", "api_key", "clear_api_key")}),
        ("Sender and application URLs", {"fields": ("sender_domain", "from_email", "from_name", "frontend_url", "backend_url")}),
        ("OTP policy", {"fields": ("otp_length", "expiry_minutes", "resend_seconds", "max_attempts", "max_per_hour")}),
        ("Audit", {"fields": ("updated_at",)}),
    )

    def key_configured(self, obj):
        return bool(obj.encrypted_api_key)
    key_configured.boolean = True

    def has_add_permission(self, request):
        return super().has_add_permission(request) and not EmailOTPSetup.objects.exists()

    def get_urls(self):
        return [path("<int:object_id>/test/<str:kind>/", self.admin_site.admin_view(self.test_view), name="accounts_emailotpsetup_test")] + super().get_urls()

    @method_decorator(sensitive_post_parameters("api_key"))
    def changeform_view(self, request, object_id=None, form_url="", extra_context=None):
        return super().changeform_view(request, object_id, form_url, extra_context)

    def test_view(self, request, object_id, kind):
        if not self.has_change_permission(request) or kind not in {"email", "otp"}:
            raise PermissionDenied
        setup = get_object_or_404(EmailOTPSetup, pk=object_id)
        form = TestEmailForm(request.POST or None)
        if request.method == "POST" and form.is_valid():
            recipient = form.cleaned_data["recipient"]
            try:
                setup.full_clean()
                if not setup.from_email:
                    raise ValidationError("Save a from email before testing.")
            except ValidationError:
                form.add_error(None, "Complete and save valid sender/provider settings before testing.")
            else:
                if kind == "otp":
                    # The dedicated purpose is never accepted by authentication endpoints.
                    from .views import _issue_email_otp
                    if not setup.is_active:
                        form.add_error(None, "Activate the saved configuration before sending a test OTP.")
                    else:
                        _, error = _issue_email_otp(request.user, PasswordResetOTP.Purpose.ADMIN_TEST, recipient)
                        if error:
                            form.add_error(None, error)
                else:
                    if not send_configured_email("Bharath Painters email test", "Email delivery test. No password or OTP is included.", recipient, "ADMIN_TEST_EMAIL", setup=setup):
                        form.add_error(None, "Email delivery failed. Review delivery logs.")
                if not form.errors:
                    self.message_user(request, "Test accepted by the email provider. Check the recipient inbox.", messages.SUCCESS)
                    return redirect(reverse("admin:accounts_emailotpsetup_change", args=[setup.pk]))
        context = {**self.admin_site.each_context(request), "opts": self.model._meta, "form": form,
                   "title": "Send Test OTP" if kind == "otp" else "Send Test Email"}
        return TemplateResponse(request, "admin/accounts/emailotpsetup/test.html", context)


@admin.register(EmailDeliveryLog)
class EmailDeliveryLogAdmin(SuperuserOnlyAdmin):
    list_display = ("created_at", "recipient", "purpose", "provider", "status", "error_code")
    list_filter = ("status", "provider", "purpose")
    search_fields = ("recipient",)
    readonly_fields = ("created_at", "recipient", "purpose", "provider", "status", "error_code")

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
