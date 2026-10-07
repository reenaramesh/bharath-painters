import django.db.models.deletion
from django.db import migrations, models


def backfill_schedule_customer_contacts(apps, schema_editor):
    WorkSchedule = apps.get_model("jobs", "WorkSchedule")
    batch = []
    for schedule in WorkSchedule.objects.select_related("quotation").only(
        "id", "quotation_id", "quotation__customer_contact_id",
    ).iterator():
        if schedule.quotation.customer_contact_id:
            schedule.customer_contact_id = schedule.quotation.customer_contact_id
            batch.append(schedule)
        if len(batch) >= 500:
            WorkSchedule.objects.bulk_update(batch, ("customer_contact",))
            batch = []
    if batch:
        WorkSchedule.objects.bulk_update(batch, ("customer_contact",))


def clear_schedule_customer_contacts(apps, schema_editor):
    apps.get_model("jobs", "WorkSchedule").objects.update(customer_contact=None)


class Migration(migrations.Migration):
    dependencies = [
        ("jobs", "0028_alter_applicatorbooking_status"),
        ("quotations", "0111_quotation_property_contact"),
    ]

    operations = [
        migrations.AddField(
            model_name="workschedule",
            name="customer_contact",
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name="work_schedules_as_contact",
                to="quotations.propertycontact",
            ),
        ),
        migrations.RunPython(backfill_schedule_customer_contacts, clear_schedule_customer_contacts),
    ]
