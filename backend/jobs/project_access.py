"""Shared projections and project access for customer/painter handoffs."""
from accounts.models import BharathUser
from quotations.customer_contacts import contractor_customer_details

RESTRICTED_ASSIGNMENT_STATUSES = ("DECLINED", "RELEASED")
PROJECT_ASSIGNMENT_STATUSES = ("ASSIGNED", "ACCEPTED", "IN_PROGRESS", "COMPLETED")


def assignment_can_view_project(assignment):
    return assignment.status in PROJECT_ASSIGNMENT_STATUSES and assignment.schedule.status != "CANCELLED"


def project_customer_name(quotation, viewer=None):
    if viewer and viewer.role == BharathUser.Roles.CUSTOMER:
        return quotation.customer.name
    return contractor_customer_details(quotation.customer, quotation.contractor)["name"]


def participating_painters(schedule):
    return schedule.painter_assignments.exclude(status__in=RESTRICTED_ASSIGNMENT_STATUSES)


def all_participants_completed(schedule):
    participants = participating_painters(schedule)
    return participants.exists() and not participants.exclude(status="COMPLETED").exists()
