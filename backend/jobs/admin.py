from django.contrib import admin

from .models import Job, JobApplication


@admin.register(Job)
class JobAdmin(admin.ModelAdmin):

    list_display = (
        "title",
        "contractor",
        "service_type",
        "city",
        "job_type",
        "number_of_painters",
        "start_date",
        "status",
    )

    list_filter = (
        "job_type",
        "status",
        "city",
        "service_type",
    )

    search_fields = (
        "title",
        "city",
        "location",
        "contractor__mobile",
    )


@admin.register(JobApplication)
class JobApplicationAdmin(admin.ModelAdmin):

    list_display = (
        "job",
        "painter",
        "status",
        "applied_at",
    )

    list_filter = (
        "status",
    )

    search_fields = (
        "job__title",
        "painter__mobile",
    )