from django.urls import path
from .views import EventsView, ReportView, UsersView, BehaviorView, ExportView

urlpatterns = [path('events/', EventsView.as_view()), path('report/', ReportView.as_view()), path('users/', UsersView.as_view()),
               path('behavior/', BehaviorView.as_view()), path('export/', ExportView.as_view())]
