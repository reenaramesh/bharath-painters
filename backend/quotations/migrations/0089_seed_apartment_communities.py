import json
from pathlib import Path

from django.db import migrations


def seed_apartment_communities(apps, schema_editor):
    community_model = apps.get_model("quotations", "ApartmentCommunity")
    database = schema_editor.connection.alias
    directory = Path(__file__).resolve().parent.parent / "data" / "apartment_communities.json"
    records = json.loads(directory.read_text(encoding="utf-8"))

    existing = {
        (name.casefold(), pincode): (pk, is_active)
        for pk, name, pincode, is_active in community_model.objects.using(database).values_list(
            "pk", "name", "pincode", "is_active"
        )
    }
    new_communities = []
    inactive_ids = []
    for record in records:
        name = record["name"].strip()
        pincode = record["pincode"].strip()
        if not name:
            continue
        key = (name.casefold(), pincode)
        if key in existing:
            pk, is_active = existing[key]
            if not is_active:
                inactive_ids.append(pk)
            continue
        existing[key] = (None, True)
        new_communities.append(community_model(
            name=name,
            zone=record["zone"],
            locality=record["locality"],
            pincode=pincode,
            is_active=True,
        ))

    community_model.objects.using(database).bulk_create(
        new_communities, batch_size=250, ignore_conflicts=True
    )
    if inactive_ids:
        community_model.objects.using(database).filter(pk__in=inactive_ids).update(is_active=True)


class Migration(migrations.Migration):
    dependencies = [("quotations", "0088_customer_mobile_e164_length")]

    operations = [migrations.RunPython(seed_apartment_communities, migrations.RunPython.noop)]
