from django.urls import path

from .views import CustomerCallHistoryView, EventBookSiteVisitView, EventDetailView, EventListCreateView, action_view
from .shared_contacts import SharedContactLookupView

urlpatterns = [
    path('shared-contact-lookup/', SharedContactLookupView.as_view(), name='shared-contact-lookup'),
    path("events/", EventListCreateView.as_view(), name="call-event-list"),
    path("events/<int:pk>/", EventDetailView.as_view(), name="call-event-detail"),
    path("events/<int:pk>/book-site-visit/", EventBookSiteVisitView.as_view(), name="call-event-book-site-visit"),
    path("events/<int:pk>/add-customer/", action_view("add_customer"), name="call-event-add-customer"),
    path("events/<int:pk>/link-customer/", action_view("link_customer"), name="call-event-link-customer"),
    path("events/<int:pk>/create-lead/", action_view("create_lead"), name="call-event-create-lead"),
    path("events/<int:pk>/dismiss/", action_view("dismiss"), name="call-event-dismiss"),
    path("events/<int:pk>/block/", action_view("block"), name="call-event-block"),
    path("customers/<int:customer_id>/events/", CustomerCallHistoryView.as_view(), name="customer-call-history"),
]
