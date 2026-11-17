from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path
from jobs.photo_delivery import deny_public_work_photo, guarded_media


urlpatterns = [
    path('api/application-analytics/', include('application_analytics.urls')),
    path(
        "admin/",
        admin.site.urls
    ),

    path(
        "api/accounts/",
        include("accounts.urls")
    ),

    path(
        "api/jobs/",
        include("jobs.urls")
    ),

    path(
        "api/quotations/",
        include("quotations.urls")
    ),
    path("api/billing/", include("billing.urls")),
    path("api/outsourcing/", include("outsourcing.urls")),
    path("api/call-inbox/", include("call_inbox.urls")),
]


urlpatterns += [path(f"{settings.MEDIA_URL.lstrip('/')}work_photos/<path:filename>", deny_public_work_photo)]

urlpatterns += static(
        settings.MEDIA_URL,
        view=guarded_media,
        document_root=settings.MEDIA_ROOT
    )
