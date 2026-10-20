"""Employee registration metadata, setup-link issuance and registered-account lookup."""
from django.conf import settings
from django.contrib.auth.hashers import UNUSABLE_PASSWORD_PREFIX
from django.core import signing
from django.db import transaction
from django.db.models import Prefetch, Q
from rest_framework.permissions import BasePermission, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import BharathUser
from .models import ContractorApplicatorTeam

IN_HOUSE_EMPLOYEE_ACTIVATION_SALT = "jobs.in-house-employee-activation.v1"
IN_HOUSE_EMPLOYEE_ACTIVATION_MAX_AGE = 7 * 24 * 60 * 60


def verified_employee_contractor(user):
    return bool(user.is_authenticated and user.is_active and user.role == BharathUser.Roles.CONTRACTOR
                and user.is_verified and user.verification_status == BharathUser.VerificationStatus.VERIFIED)


def employee_account_data(member, actor):
    employee = member.painter
    registered = employee.has_usable_password()
    return {
        "registration_status": "REGISTERED" if registered else "UNREGISTERED",
        "account_is_active": employee.is_active,
        "can_resend_activation": bool(
            not registered and employee.role == BharathUser.Roles.PAINTER and employee.is_active and employee.is_verified
            and employee.verification_status == BharathUser.VerificationStatus.VERIFIED
            and member.is_active and member.employment_type == ContractorApplicatorTeam.EmploymentType.IN_HOUSE
            and member.contractor_id == actor.pk and verified_employee_contractor(actor)
        ),
    }


def employee_activation_url(member):
    token = signing.dumps({"user_id": member.painter_id, "membership_id": member.pk}, salt=IN_HOUSE_EMPLOYEE_ACTIVATION_SALT)
    return f"{settings.FRONTEND_URL.rstrip('/')}/employee-activation/{token}"


class VerifiedEmployeeContractor(BasePermission):
    message = "Verified contractor access only."

    def has_permission(self, request, view):
        return verified_employee_contractor(request.user)


class EmployeeActivationLinkView(APIView):
    permission_classes = [IsAuthenticated, VerifiedEmployeeContractor]

    @transaction.atomic
    def post(self, request, pk):
        scope = ContractorApplicatorTeam.objects.filter(
            pk=pk, contractor=request.user, employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
        )
        painter_id = scope.values_list("painter_id", flat=True).first()
        if not painter_id:
            return Response({"detail": "Employee not found."}, status=404)
        # Match password setup's identity-before-membership lock order.
        employee = BharathUser.objects.select_for_update().filter(pk=painter_id).first()
        member = scope.select_for_update().filter(painter_id=painter_id).first()
        if not employee or not member:
            return Response({"detail": "Employee not found."}, status=404)
        member.painter = employee
        if employee.has_usable_password():
            return Response({"detail": "This employee is already registered. Use Forgot Password to recover access."}, status=409)
        if employee.role != BharathUser.Roles.PAINTER or not employee_account_data(member, request.user)["can_resend_activation"]:
            return Response({"detail": "Activation is unavailable for a removed, disabled or unverified employee."}, status=409)
        response = Response({
            "membership_id": member.pk, "registration_status": "UNREGISTERED",
            "activation_url": employee_activation_url(member), "expires_in_days": 7,
        })
        response["Cache-Control"] = "no-store"
        return response


class RegisteredEmployeeSearchView(APIView):
    permission_classes = [IsAuthenticated, VerifiedEmployeeContractor]

    def get(self, request):
        query = str(request.query_params.get("search") or "").strip()[:80]
        if len(query) < 3:
            return Response([])
        employees = BharathUser.objects.filter(
            role=BharathUser.Roles.PAINTER, is_active=True, is_verified=True,
            verification_status=BharathUser.VerificationStatus.VERIFIED,
        ).exclude(password__startswith=UNUSABLE_PASSWORD_PREFIX)
        for term in query.split():
            employees = employees.filter(Q(first_name__icontains=term) | Q(last_name__icontains=term)
                                         | Q(mobile__icontains=term) | Q(bharath_id__icontains=term))
        employees = employees.select_related("painter_profile").prefetch_related(Prefetch(
            "contractor_teams",
            queryset=ContractorApplicatorTeam.objects.filter(
                contractor=request.user, employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
            ), to_attr="employee_search_memberships",
        )).order_by("first_name", "last_name", "id")[:20]
        results = []
        for employee in employees:
            profile = getattr(employee, "painter_profile", None)
            memberships = employee.employee_search_memberships
            results.append({
                "id": employee.pk, "name": employee.get_full_name() or employee.mobile,
                "mobile": employee.mobile, "bharath_id": employee.bharath_id,
                "experience_years": profile.experience_years if profile else 0,
                "skills": profile.skills if profile else "",
                "employee_membership_id": memberships[0].pk if memberships else None,
            })
        response = Response(results)
        response["Cache-Control"] = "no-store"
        return response
