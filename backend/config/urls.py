from django.contrib import admin
from django.conf import settings
from django.conf.urls.static import static
from django.urls import include, path


urlpatterns = [
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
]


urlpatterns += static(
        settings.MEDIA_URL,
        document_root=settings.MEDIA_ROOT
    )
