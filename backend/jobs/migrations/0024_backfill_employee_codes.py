from django.db import migrations


def backfill_employee_codes(apps, schema_editor):
    Team = apps.get_model("jobs", "ContractorApplicatorTeam")
    counters = {}
    rows = Team.objects.filter(employee_code="").order_by("contractor_id", "added_at", "id")
    for row in rows.iterator():
        source_date = row.joined_on or row.added_at.date()
        key = (row.contractor_id, source_date.year)
        if key not in counters:
            prefix = f"BPE-{source_date.year}-"
            existing = Team.objects.filter(
                contractor_id=row.contractor_id,
                employee_code__startswith=prefix,
            ).values_list("employee_code", flat=True)
            serials = []
            for code in existing:
                try:
                    serials.append(int(code.removeprefix(prefix)))
                except (TypeError, ValueError):
                    continue
            counters[key] = max(serials, default=0)
        counters[key] += 1
        row.employee_code = f"BPE-{source_date.year}-{counters[key]:04d}"
        row.save(update_fields=("employee_code",))


class Migration(migrations.Migration):
    dependencies = [("jobs", "0023_contractorapplicatorteam_unique_employee_code_per_contractor")]
    operations = [migrations.RunPython(backfill_employee_codes, migrations.RunPython.noop)]
