from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from accounts.mobile import normalize_mobile
from accounts.painter_contacts import existing_painter_path
from quotations.shared_contacts import shared_customer_match
from .views import contractor_only


class SharedContactLookupView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not contractor_only(request):
            return Response({'detail': 'Contractor access only.'}, status=403)
        category = request.query_params.get('category')
        if category not in ('Painter', 'Customer'):
            return Response({'category': ['Select Painter or Customer.']}, status=400)
        mobile = normalize_mobile(request.query_params.get('mobile'))
        if not mobile:
            return Response({'mobile': ['Enter a valid mobile number with country code.']}, status=400)
        if category == 'Painter':
            path = existing_painter_path(request.user, mobile)
        else:
            contact = shared_customer_match(request.user, mobile)
            path = f'/customers/{contact.pk}' if contact else None
        return Response({'mobile': mobile, 'existing_url': path})
