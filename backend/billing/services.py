from django.db.models import Q
from django.utils import timezone
from datetime import timedelta
from rest_framework.exceptions import ValidationError

from accounts.models import BharathUser
from .models import BillingNotification, BillingPlan, Subscription


def sync_subscription_status(user):
    today = timezone.localdate()
    expired = Subscription.objects.filter(user=user, is_active=True, end_date__lt=today)
    for item in expired:
        item.is_active = False
        item.cancelled_at = timezone.now()
        item.save(update_fields=["is_active", "cancelled_at"])
        BillingNotification.objects.get_or_create(
            user=user, title="Package expired",
            defaults={"message": f"Your {item.plan.name} package expired on {item.end_date}. Free-plan limits now apply."},
        )


def effective_plan(user):
    sync_subscription_status(user)
    today = timezone.localdate()
    subscription = Subscription.objects.select_related("plan").filter(
        user=user, is_active=True, plan__is_active=True, start_date__lte=today,
    ).filter(Q(end_date__isnull=True) | Q(end_date__gte=today)).first()
    if subscription:
        if subscription.end_date and subscription.end_date <= today + timedelta(days=7) and not subscription.expiry_notified_at:
            BillingNotification.objects.create(user=user, title="Package expiring soon", message=f"Your {subscription.plan.name} package expires on {subscription.end_date}. Renew it from Plans to avoid interruption.")
            subscription.expiry_notified_at = timezone.now()
            subscription.save(update_fields=["expiry_notified_at"])
        return subscription.plan, subscription
    plan = BillingPlan.objects.filter(
        audience=user.role, billing_cycle=BillingPlan.Cycle.FREE, is_active=True,
    ).first()
    return plan, None


def billing_summary(user):
    plan, subscription = effective_plan(user)
    result = {
        "role": user.role,
        "plan": plan_data(plan),
        "subscription": None if not subscription else {
            "id": subscription.id,
            "start_date": subscription.start_date,
            "end_date": subscription.end_date,
            "is_active": subscription.is_active,
            "auto_renew": subscription.auto_renew,
        },
        "usage": {},
        "notifications": [{"id": item.id, "title": item.title, "message": item.message, "is_read": item.is_read, "created_at": item.created_at} for item in BillingNotification.objects.filter(user=user)[:10]],
    }
    if user.role == BharathUser.Roles.CONTRACTOR:
        from jobs.models import ContractorApplicatorTeam
        from quotations.models import Quotation
        quotation_query = Quotation.objects.filter(contractor=user)
        if subscription:
            quotation_query = quotation_query.filter(created_at__date__gte=subscription.start_date)
        quotations = quotation_query.count()
        employees = ContractorApplicatorTeam.objects.filter(contractor=user, is_active=True).count()
        result["usage"] = {
            "quotations": usage_data(quotations, plan.quotation_limit if plan else 5),
            "employees": usage_data(employees, plan.employee_limit if plan else 2),
        }
    return result


def plan_data(plan):
    if not plan:
        return None
    return {
        "id": plan.id, "name": plan.name, "audience": plan.audience,
        "billing_cycle": plan.billing_cycle, "price": plan.price,
        "discount_percentage": plan.discount_percentage,
        "discounted_price": plan.discounted_price,
        "validity": plan.validity, "job_post_limit": plan.job_post_limit,
        "quotation_limit": plan.quotation_limit, "employee_limit": plan.employee_limit,
        "applicator_access": plan.applicator_access,
        "measurement_access": plan.measurement_access,
        "register_applicator_access": plan.register_applicator_access,
        "ratings_reviews_access": plan.ratings_reviews_access,
        "work_schedules_access": plan.work_schedules_access,
        "seeking_applicators_access": plan.seeking_applicators_access,
        "property_creation_access": plan.property_creation_access,
        "messages_access": plan.messages_access,
        "job_seeking_post_limit": plan.job_seeking_post_limit,
        "contractor_job_access": plan.contractor_job_access,
        "contractor_visibility": plan.contractor_visibility,
        "booking_requests": plan.booking_requests,
        "availability_calendar": plan.availability_calendar,
        "location_limit": plan.location_limit,
        "features": [line.strip() for line in plan.features.splitlines() if line.strip()],
        "is_active": plan.is_active,
    }


def usage_data(used, limit):
    return {"used": used, "limit": limit, "remaining": None if limit is None else max(0, limit - used)}


def enforce_quotation_limit(user):
    plan, subscription = effective_plan(user)
    limit = plan.quotation_limit if plan else 5
    if limit is not None:
        from quotations.models import Quotation
        query = Quotation.objects.filter(contractor=user)
        if subscription:
            query = query.filter(created_at__date__gte=subscription.start_date)
        if query.count() >= limit:
            raise ValidationError({"detail": f"Your {plan.name if plan else 'Free'} plan allows {limit} quotations. Upgrade your package to create another quotation."})


def enforce_employee_limit(user):
    plan, _ = effective_plan(user)
    limit = plan.employee_limit if plan else 2
    if limit is not None:
        from jobs.models import ContractorApplicatorTeam
        if ContractorApplicatorTeam.objects.filter(contractor=user, is_active=True).count() >= limit:
            raise ValidationError({"detail": f"Your {plan.name if plan else 'Free'} plan allows {limit} employees. Upgrade your package to add another employee."})


def _within_subscription_period(queryset, subscription):
    if subscription:
        queryset = queryset.filter(created_at__date__gte=subscription.start_date)
        if subscription.end_date:
            queryset = queryset.filter(created_at__date__lte=subscription.end_date)
    return queryset


def enforce_job_post_limit(user):
    plan, subscription = effective_plan(user)
    limit = plan.job_post_limit if plan else 1
    if limit is None:
        return
    from jobs.models import Job
    used = _within_subscription_period(Job.objects.filter(contractor=user), subscription).count()
    if used >= limit:
        raise ValidationError({"detail": f"Your {plan.name if plan else 'Free'} plan allows {limit} job posts. Upgrade your package to post another job."})


def enforce_job_seeking_post_limit(user):
    plan, subscription = effective_plan(user)
    limit = plan.job_seeking_post_limit if plan else 1
    if limit is None:
        return
    from jobs.models import PainterSeekingPost
    used = _within_subscription_period(PainterSeekingPost.objects.filter(painter=user), subscription).count()
    if used >= limit:
        raise ValidationError({"detail": f"Your {plan.name if plan else 'Free'} plan allows {limit} job-seeking posts. Upgrade your package to add another post."})


def enforce_location_limit(user, pin_codes):
    plan, _ = effective_plan(user)
    limit = plan.location_limit if plan else 1
    if limit is not None and len(set(pin_codes)) > limit:
        raise ValidationError({"pincode": f"Your {plan.name if plan else 'Free'} plan allows {limit} service location PIN codes."})
