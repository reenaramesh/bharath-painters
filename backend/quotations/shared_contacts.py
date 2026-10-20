"""Opt-in address-book creation through the existing CRM endpoint."""
from django.db import IntegrityError, transaction
from rest_framework.response import Response
from .models import Customer, SavedCustomerContact, ContractorCustomerConnection
from .serializers import CustomerSerializer, saved_contact_representation


def shared_customer_match(contractor, normalized):
    from call_inbox.views import visible_customers
    pending = Customer.objects.filter(
        contractor_connections__contractor=contractor,
        contractor_connections__status=ContractorCustomerConnection.Status.PENDING,
    ).exclude(status=Customer.Status.CANCELLED).distinct()
    return (visible_customers(contractor) | pending).filter(normalized_mobile=normalized).distinct().first()


def save_shared_customer(request, normalized):
    existing = shared_customer_match(request.user, normalized)
    if existing:
        return Response({**CustomerSerializer(existing, context={'request': request}).data, 'already_saved': True})
    # Customer identity is global, entered contact details belong to the owner.
    # Do not activate, connect, notify, or expose another contractor's details.
    customer = Customer.objects.select_for_update().filter(normalized_mobile=normalized).exclude(status=Customer.Status.CANCELLED).first()
    payload = {key: request.data[key] for key in ('name', 'mobile', 'notes') if key in request.data}
    payload['mobile'] = normalized
    payload['source'] = Customer.Source.PHONE
    serializer = CustomerSerializer(customer, data=payload, context={'request': request})
    serializer.is_valid(raise_exception=True)
    if customer is None:
        from .customer_identity import release_deleted_customer_mobile
        release_deleted_customer_mobile(normalized)
        try:
            with transaction.atomic():
                customer = serializer.save(contractor=request.user)
        except IntegrityError:
            customer = Customer.objects.exclude(status=Customer.Status.CANCELLED).get(normalized_mobile=normalized)
    contact, created = SavedCustomerContact.objects.get_or_create(
        customer=customer, contractor=request.user,
        defaults={'details': dict(serializer.validated_data)},
    )
    return Response({**saved_contact_representation(contact), 'already_saved': not created}, status=201 if created else 200)
