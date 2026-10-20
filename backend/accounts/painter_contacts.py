from django.db import transaction
from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .mobile import normalize_mobile, matching_mobile_users
from .models import BharathUser, PainterContact, PainterProfile


def existing_painter_path(contractor, mobile):
    contact = PainterContact.objects.filter(contractor=contractor, mobile=mobile).first()
    if contact:
        return f'/painters/contacts/{contact.pk}'
    # Only the contractor's private painter list defines a duplicate. A global
    # profile can be referenced on first save, but is not an owned contact.
    return None


class PainterContactSerializer(serializers.ModelSerializer):
    mobile = serializers.CharField(max_length=32)
    verified = serializers.SerializerMethodField()

    class Meta:
        model = PainterContact
        fields = ('id', 'name', 'mobile', 'remarks', 'profile', 'verified')
        read_only_fields = ('id', 'profile', 'verified')

    def get_verified(self, obj):
        return False

    def validate_mobile(self, value):
        normalized = normalize_mobile(value)
        if not normalized:
            raise serializers.ValidationError('Enter a valid mobile number with country code.')
        return normalized


class PainterContactView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request, pk=None):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({'detail': 'Contractor access only.'}, status=403)
        contacts = PainterContact.objects.filter(contractor=request.user).order_by('-id')
        if pk is not None:
            return Response(PainterContactSerializer(get_object_or_404(contacts, pk=pk)).data)
        return Response(PainterContactSerializer(contacts, many=True).data)

    @transaction.atomic
    def post(self, request):
        if request.user.role != BharathUser.Roles.CONTRACTOR:
            return Response({'detail': 'Contractor access only.'}, status=403)
        serializer = PainterContactSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # Serialize imports per owner; the database constraint is the final guard.
        BharathUser.objects.select_for_update().get(pk=request.user.pk)
        mobile = serializer.validated_data['mobile']
        path = existing_painter_path(request.user, mobile)
        if path:
            return Response({'already_saved': True, 'existing_url': path})
        users = matching_mobile_users(mobile, BharathUser.objects.filter(role=BharathUser.Roles.PAINTER))
        profile = PainterProfile.objects.filter(user__in=users).first() if users else None
        contact = serializer.save(contractor=request.user, profile=profile)
        return Response(PainterContactSerializer(contact).data, status=201)
