from django.contrib import admin
from .models import Advertisement, BillingNotification, BillingPlan, PackageRequest, Subscription


@admin.register(BillingPlan)
class BillingPlanAdmin(admin.ModelAdmin):
    list_display = ("name", "audience", "billing_cycle", "price", "quotation_limit", "employee_limit", "is_active")
    list_filter = ("audience", "billing_cycle", "is_active")
    search_fields = ("name",)


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ("user", "plan", "start_date", "end_date", "is_active")
    list_filter = ("plan__audience", "is_active")
    search_fields = ("user__mobile", "user__first_name", "user__last_name")


@admin.register(Advertisement)
class AdvertisementAdmin(admin.ModelAdmin):
    list_display = ("title", "placement", "start_date", "end_date", "is_active")
    list_filter = ("placement", "is_active")
    search_fields = ("title", "description")


@admin.register(PackageRequest)
class PackageRequestAdmin(admin.ModelAdmin):
    list_display = ("invoice_number", "user", "plan", "amount", "payment_status", "status", "requested_at")
    list_filter = ("status", "plan__audience")
    search_fields = ("user__mobile", "user__first_name", "plan__name")


@admin.register(BillingNotification)
class BillingNotificationAdmin(admin.ModelAdmin):
    list_display = ("user", "title", "is_read", "created_at")
