import re
from django.db import transaction
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from .models import RoleMenuVisibility

class MenuVisibilityView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        result = {"CONTRACTOR": [], "PAINTER": []}
        for entry in RoleMenuVisibility.objects.all():
            result[entry.role] = entry.disabled
        return Response(result)

    @transaction.atomic
    def patch(self, request):
        if request.user.role != "ADMIN":
            return Response({"detail": "Only admins can change menu visibility."}, status=403)
        role, disabled = request.data.get("role"), request.data.get("disabled")
        protected = {"dashboard", "security", "profile", "settings"}
        if role not in {"CONTRACTOR", "PAINTER"} or not isinstance(disabled, list) or len(disabled) > 100 or any(not isinstance(value, str) or not re.fullmatch(r"[a-z][a-z0-9-]{0,63}", value) or value in protected for value in disabled):
            return Response({"detail": "Choose a worker role and valid optional menus."}, status=400)
        RoleMenuVisibility.objects.update_or_create(role=role, defaults={"disabled": list(dict.fromkeys(disabled))})
        return self.get(request)
