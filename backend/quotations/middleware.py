import json
import re

from rest_framework_simplejwt.authentication import JWTAuthentication

from .models import ActivityLog


class ActivityLogMiddleware:
    ACTIONS = {"POST": "CREATE", "PUT": "UPDATE", "PATCH": "UPDATE", "DELETE": "DELETE"}
    SENSITIVE = {"password", "new_password", "confirm_password", "access", "refresh", "token"}
    LABELS = {
        "quotations": "Quotation", "customers": "Customer", "properties": "Property",
        "tasks": "Task", "measurements": "Area Calculation", "rooms": "Room",
        "service-requests": "Service request", "support-tickets": "Support ticket",
        "leads": "Lead", "billing": "Billing", "jobs": "Job", "work-schedules": "Work schedule",
    }

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        user = getattr(request, "user", None)
        if request.method in self.ACTIONS and (not user or not user.is_authenticated):
            try:
                authenticated = JWTAuthentication().authenticate(request)
                if authenticated:
                    request.user = authenticated[0]
            except Exception:
                pass

        response = self.get_response(request)
        user = getattr(request, "user", None)
        if self._should_log(request, response, user):
            try:
                self._record(request, response, user)
            except Exception:
                pass
        return response

    def _should_log(self, request, response, user):
        is_login = request.path.endswith("/accounts/login/") and request.method == "POST"
        is_download = request.method == "GET" and any(marker in request.path for marker in ("/pdf/", "/export/"))
        return (
            (request.method in self.ACTIONS or is_login or is_download)
            and (is_login or (user and user.is_authenticated))
            and request.path.startswith("/api/")
            and "activity-logs" not in request.path
            and "/token/" not in request.path
        )

    def _record(self, request, response, user):
        is_login = request.path.endswith("/accounts/login/")
        is_download = request.method == "GET"
        parts = [part for part in request.path.strip("/").split("/") if part and not part.isdigit()]
        module_key = parts[2] if len(parts) > 2 and parts[1] == "quotations" else (parts[1] if len(parts) > 1 else "system")
        label = self.LABELS.get(module_key, module_key.replace("-", " ").title())
        changes = self._safe_payload(request)
        action = "LOGIN" if is_login and response.status_code < 400 else "LOGIN_FAILED" if is_login else "DOWNLOAD" if is_download else self.ACTIONS[request.method]
        if action == "UPDATE" and "status" in changes:
            action = "STATUS_CHANGE"
        object_ids = re.findall(r"/(\d+)(?:/|$)", request.path)
        if is_login and (not user or not user.is_authenticated) and response.status_code < 400:
            user_id = getattr(response, "data", {}).get("user", {}).get("id")
            from django.contrib.auth import get_user_model
            user = get_user_model().objects.filter(id=user_id).first()
        display_name = (user.get_full_name().strip() or getattr(user, "email", "") or getattr(user, "mobile", "")) if user and user.is_authenticated else "Failed sign-in"
        ActivityLog.objects.create(
            actor=user if user and user.is_authenticated else None, actor_name=display_name, actor_role=getattr(user, "role", ""),
            action=action, module=label,
            description=f"{action.title()} {label.lower()}", method=request.method,
            path=request.path[:255], object_id=object_ids[-1] if object_ids else "",
            status_code=response.status_code, metadata={"changes": changes},
            is_flagged=action in {"DELETE", "LOGIN_FAILED"},
            ip_address=(request.META.get("HTTP_X_FORWARDED_FOR", "").split(",")[0].strip() or request.META.get("REMOTE_ADDR") or None),
        )

    def _safe_payload(self, request):
        if request.method not in {"POST", "PUT", "PATCH"} or not request.body:
            return {}
        try:
            payload = json.loads(request.body.decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return {}
        if not isinstance(payload, dict):
            return {"items": len(payload)} if isinstance(payload, list) else {}
        clean = {}
        for key, value in payload.items():
            if key.lower() in self.SENSITIVE:
                continue
            if isinstance(value, (str, int, float, bool)) or value is None:
                clean[key] = str(value)[:160] if isinstance(value, str) else value
            elif isinstance(value, list):
                clean[key] = f"{len(value)} item(s)"
            elif isinstance(value, dict):
                clean[key] = "Updated"
        return clean
