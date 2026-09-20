from django.urls import path

from .views import (
    JobCreateView, JobActivityView,
    JobListView,
    JobApplyView,ContractorApplicationListView, AcceptJobApplicationView, RejectJobApplicationView,
    JobApplicationCancellationView, JobApplicationReassignView, JobApplicationRatingView, JobTransferResponseView,
    WorkScheduleListCreateView, WorkScheduleAcceptView, WorkSchedulePainterView, WorkSchedulePaymentView, WorkScheduleAdvanceReceiptView, WorkScheduleCancelView, WorkScheduleProgressView,
    PainterSeekingListCreateView, PainterSeekingDetailView,
    PainterAssignmentListView, PainterAssignmentProgressView, PainterDashboardView,
    ContractorApplicatorTeamView, ContractorApplicatorTeamDetailView,
    ContractorApplicatorCreateView, ApplicatorProfileView, ApplicatorAvailabilityView,
    ApplicatorBookingListCreateView, ApplicatorBookingSearchView, ApplicatorBookingActionView,
    ApplicatorAvailabilityBlockView, ApplicatorAvailabilityBlockDetailView,
    InHouseApplicatorListView, InHouseApplicatorDetailView, InHouseAttendanceView, InHouseLedgerView,
    MyInHouseEmploymentView,
    MyInHouseEarningsView,
    WorkReviewListCreateView,
    WorkPhotoListCreateView, WorkPhotoDetailView, OperationsReportView,
)

urlpatterns = [
    path("activity/", JobActivityView.as_view(), name="job-activity"),
    path("seeking/", PainterSeekingListCreateView.as_view(), name="painter-seeking-list"),
    path("seeking/<int:pk>/", PainterSeekingDetailView.as_view(), name="painter-seeking-detail"),
    path("my-assignments/", PainterAssignmentListView.as_view(), name="painter-assignment-list"),
    path("applicator-dashboard/", PainterDashboardView.as_view(), name="painter-dashboard"),
    path("my-assignments/<int:pk>/progress/", PainterAssignmentProgressView.as_view(), name="painter-assignment-progress"),
    path("my-team/", ContractorApplicatorTeamView.as_view(), name="contractor-applicator-team"),
    path("my-team/<int:pk>/", ContractorApplicatorTeamDetailView.as_view(), name="contractor-applicator-team-detail"),
    path("my-team/create-applicator/", ContractorApplicatorCreateView.as_view(), name="contractor-create-applicator"),
    path("in-house-applicators/", InHouseApplicatorListView.as_view(), name="in-house-applicator-list"),
    path("in-house-applicators/<int:pk>/", InHouseApplicatorDetailView.as_view(), name="in-house-applicator-detail"),
    path("in-house-applicators/<int:pk>/attendance/", InHouseAttendanceView.as_view(), name="in-house-attendance"),
    path("in-house-applicators/<int:pk>/ledger/", InHouseLedgerView.as_view(), name="in-house-ledger"),
    path("my-in-house-employment/", MyInHouseEmploymentView.as_view(), name="my-in-house-employment"),
    path("my-in-house-earnings/", MyInHouseEarningsView.as_view(), name="my-in-house-earnings"),
    path("work-reviews/", WorkReviewListCreateView.as_view(), name="work-review-list-create"),
    path("work-photos/", WorkPhotoListCreateView.as_view(), name="work-photo-list-create"),
    path("work-photos/<int:pk>/", WorkPhotoDetailView.as_view(), name="work-photo-detail"),
    path("reports/", OperationsReportView.as_view(), name="operations-report"),
    path("applicator-profile/", ApplicatorProfileView.as_view(), name="applicator-profile"),
    path("applicator-availability/", ApplicatorAvailabilityView.as_view(), name="applicator-availability"),
    path("applicator-availability/blocks/", ApplicatorAvailabilityBlockView.as_view(), name="applicator-availability-block"),
    path("applicator-availability/blocks/<int:pk>/", ApplicatorAvailabilityBlockDetailView.as_view(), name="applicator-availability-block-detail"),
    path("applicator-bookings/", ApplicatorBookingListCreateView.as_view(), name="applicator-booking-list"),
    path("applicator-bookings/search/", ApplicatorBookingSearchView.as_view(), name="applicator-booking-search"),
    path("applicator-bookings/<int:pk>/action/", ApplicatorBookingActionView.as_view(), name="applicator-booking-action"),
    path("work-schedules/", WorkScheduleListCreateView.as_view(), name="work-schedule-list"),
    path("work-schedules/<int:pk>/accept/", WorkScheduleAcceptView.as_view(), name="work-schedule-accept"),
    path("work-schedules/<int:pk>/painters/", WorkSchedulePainterView.as_view(), name="work-schedule-painters"),
    path("work-schedules/<int:pk>/payment/", WorkSchedulePaymentView.as_view(), name="work-schedule-payment"),
    path("work-schedules/<int:pk>/advance-receipt/", WorkScheduleAdvanceReceiptView.as_view(), name="work-schedule-advance-receipt"),
    path("work-schedules/<int:pk>/cancel/", WorkScheduleCancelView.as_view(), name="work-schedule-cancel"),
    path("work-schedules/<int:pk>/progress/", WorkScheduleProgressView.as_view(), name="work-schedule-progress"),

    path(
        "create/",
        JobCreateView.as_view(),
        name="job-create",
    ),

    path(
        "list/",
        JobListView.as_view(),
        name="job-list",
    ),

    path(
        "<int:job_id>/apply/",
        JobApplyView.as_view(),
        name="job-apply",
    ),

    path(
        "<int:job_id>/applications/",
        ContractorApplicationListView.as_view(),
        name="contractor-applications",
    ),

    path(
        "applications/<int:application_id>/accept/",
        AcceptJobApplicationView.as_view(),
        name="accept-job-application",
),

    path(
        "applications/<int:application_id>/reject/",
        RejectJobApplicationView.as_view(),
        name="reject-job-application",
    ),
    path("applications/<int:application_id>/cancellation/", JobApplicationCancellationView.as_view(), name="job-application-cancellation"),
    path("applications/<int:application_id>/reassign/", JobApplicationReassignView.as_view(), name="job-application-reassign"),
    path("transfers/<int:transfer_id>/respond/", JobTransferResponseView.as_view(), name="job-transfer-response"),
    path("applications/<int:application_id>/rating/", JobApplicationRatingView.as_view(), name="job-application-rating"),

]
