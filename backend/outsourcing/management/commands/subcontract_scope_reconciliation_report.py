"""Read-only report of subcontract scope rows lacking an exact project link."""
import json

from django.core.management.base import BaseCommand

from outsourcing.models import SubcontractWorkOrderScope


class Command(BaseCommand):
    help = "Report subcontract scopes that need manual project-scope reconciliation; changes no records."

    def handle(self, *args, **options):
        rows = SubcontractWorkOrderScope.objects.filter(
            project_scope__isnull=True,
            source_quotation_item__isnull=True,
        ).select_related("work_order", "work_order__quotation").order_by("work_order_id", "id")
        self.stdout.write(f"unlinked_scopes={rows.count()}")
        for scope in rows.iterator():
            self.stdout.write(json.dumps({
                "work_order_id": scope.work_order_id,
                "work_order_reference": scope.work_order.reference,
                "quotation_id": scope.work_order.quotation_id,
                "scope_id": scope.pk,
                "scope_title": scope.title_snapshot,
                "reason": "No ProjectScope or stable quotation-item source; manual reconciliation required.",
            }, ensure_ascii=False, sort_keys=True))
