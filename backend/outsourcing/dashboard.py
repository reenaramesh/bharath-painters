"""Read-only attention queues for the main contractor's existing decisions."""
from .models import AdditionalWorkRequest, SubcontractWorkOrder


def subcontract_attention(contractor, *, offset=0, limit=6):
    """Return full owned counts and deterministic, bounded previews.

    ``offset`` and ``limit`` are nonnegative integers shared by both queues.
    Extra-work eligibility depends on the request's pending status, including
    requests on closed work orders, as in the existing decision workflow.
    """
    reviews = SubcontractWorkOrder.objects.filter(
        main_contractor=contractor,
        status=SubcontractWorkOrder.Status.SUBMITTED_FOR_REVIEW,
    ).order_by("-updated_at", "-id")
    additional_work = AdditionalWorkRequest.objects.filter(
        work_order__main_contractor=contractor,
        status=AdditionalWorkRequest.Status.PENDING,
    ).order_by("-created_at", "-id")
    preview = slice(offset, offset + limit)

    return {
        "review_count": reviews.count(),
        "additional_work_count": additional_work.count(),
        "reviews": [
            {
                "id": order["id"],
                "reference": order["reference"],
                "project_title": order["project_title"],
                "url": f'/subcontract-work-orders/{order["id"]}',
            }
            for order in reviews.values("id", "reference", "project_title")[preview]
        ],
        "additional_work": [
            {
                "id": request["id"],
                "work_order": request["work_order_id"],
                "reference": request["work_order__reference"],
                "project_title": request["work_order__project_title"],
                "description": request["description"],
                "estimated_amount": format(request["estimated_amount"], ".2f"),
                "url": f'/subcontract-work-orders/{request["work_order_id"]}',
            }
            for request in additional_work.values(
                "id", "work_order_id", "work_order__reference",
                "work_order__project_title", "description", "estimated_amount",
            )[preview]
        ],
    }
