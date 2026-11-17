"""Read-only lookup of contacts belonging to one contractor."""
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.mobile import matching_mobile_users, normalize_mobile
from accounts.models import BharathUser
from .customer_contacts import contractor_customer_details
from .models import ContractorCustomerConnection, Customer, SavedCustomerContact


def contact_lookup_payload(contractor, normalized, customer=None):
    base = {"normalized_mobile": normalized}
    unavailable = {**base, "state": "UNAVAILABLE", "message": "This number is unavailable for adding a customer. Contact support for help."}
    accounts = matching_mobile_users(normalized)
    if any(not account.is_active or account.role != BharathUser.Roles.CUSTOMER for account in accounts):
        return unavailable
    customer = customer or Customer.objects.exclude(status="CANCELLED").select_related("portal_user").filter(normalized_mobile=normalized).first()
    if not customer:
        return {**base, "state": "NEW", "message": "Customer not found in your contacts"}
    if customer.portal_user_id and (not customer.portal_user.is_active or customer.portal_user.role != BharathUser.Roles.CUSTOMER):
        return unavailable
    relation = ContractorCustomerConnection.objects.filter(customer=customer, contractor=contractor).first()
    saved = SavedCustomerContact.objects.filter(customer=customer, contractor=contractor).exists()
    connected = relation and relation.status == "CONNECTED"
    legacy_owner = customer.contractor_id == contractor.pk and not customer.contractor_connections.exists()
    if saved or connected or legacy_owner:
        details = contractor_customer_details(customer, contractor)
        return {
            **base, "state": "FOUND", "message": "Customer already exists in your contacts",
            "can_use": bool(connected),
            "customer": {"id": customer.pk, "name": details["name"], "mobile": details["mobile"] or normalized,
                         "connection_status": relation.status if relation else "LEGACY"},
        }
    if relation and (relation.status in {"BLOCKED", "DISCONNECTED", "REJECTED"} or
                     any((relation.blocked_at, relation.disconnected_at, relation.rejected_at))):
        return unavailable
    return {**base, "state": "NEW", "message": "Customer not found in your contacts"}


class CustomerContactLookupView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({"detail": "Contractor access only."}, status=status.HTTP_403_FORBIDDEN)
        normalized = normalize_mobile(request.data.get("mobile"))
        if not normalized:
            return Response({"mobile": ["Enter a valid mobile number."]}, status=status.HTTP_400_BAD_REQUEST)
        return Response(contact_lookup_payload(request.user, normalized))
