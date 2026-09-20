import django.db.models.deletion
import django.utils.timezone
from django.conf import settings
from django.db import migrations, models


def normalize_mobile(value):
    digits = "".join(character for character in str(value or "") if character.isdigit())
    if len(digits) < 10:
        return ""
    national = digits[-10:]
    return f"+91{national}" if national[0] in "6789" else ""


def forward_global_customers(apps, schema_editor):
    Customer = apps.get_model("quotations", "Customer")
    Connection = apps.get_model("quotations", "ContractorCustomerConnection")
    Property = apps.get_model("quotations", "Property")
    Measurement = apps.get_model("quotations", "PropertyMeasurement")
    Quotation = apps.get_model("quotations", "Quotation")
    Conversation = apps.get_model("quotations", "ChatConversation")
    Message = apps.get_model("quotations", "ChatMessage")
    User = apps.get_model("accounts", "BharathUser")
    now = django.utils.timezone.now()
    related_names = ("ServiceRequest", "Lead", "SiteVisit", "SupportTicket", "MeasurementAccessRequest", "CustomerFollowUp", "CustomerWorkHistory")

    groups = {}
    for customer in Customer.objects.order_by("id"):
        key = normalize_mobile(customer.mobile) or f"LEGACY-{customer.id}"
        groups.setdefault(key, []).append(customer)

    for normalized, members in groups.items():
        canonical = sorted(members, key=lambda item: (not bool(item.portal_user_id), item.id))[0]
        canonical.normalized_mobile = normalized
        canonical.save(update_fields=("normalized_mobile",))
        portal_user = next((item.portal_user for item in members if item.portal_user_id), None)
        if portal_user is None and not normalized.startswith("LEGACY-"):
            matching = [user for user in User.objects.filter(role="CUSTOMER") if normalize_mobile(user.mobile) == normalized]
            portal_user = matching[0] if len(matching) == 1 else None
        if portal_user is None and not normalized.startswith("LEGACY-") and not User.objects.filter(mobile=canonical.mobile).exists():
            portal_user = User.objects.create(mobile=canonical.mobile, email=canonical.email or "", first_name=canonical.name, password="!", role="CUSTOMER", is_active=True, is_verified=False, verification_status="PENDING", bharath_id=canonical.bharath_id)

        connections = {}
        for member in members:
            if not member.contractor_id:
                continue
            connection, _ = Connection.objects.get_or_create(customer=canonical, contractor_id=member.contractor_id, defaults={"status": "CONNECTED", "requested_by_id": member.contractor_id, "approval_method": "INITIAL_CREATOR", "connected_at": member.created_at or now, "approved_at": member.created_at or now, "requested_at": member.created_at or now})
            connections[member.contractor_id] = connection
            for prop in Property.objects.filter(customer=member):
                prop.customer_id = canonical.id
                prop.contractor_id = member.contractor_id
                prop.connection_id = connection.id
                prop.save(update_fields=("customer", "contractor", "connection"))
                Measurement.objects.filter(property=prop).update(contractor_id=member.contractor_id, created_by_id=member.contractor_id, connection_id=connection.id)
            Quotation.objects.filter(customer=member, contractor_id=member.contractor_id).update(customer_id=canonical.id, connection_id=connection.id)
            for conversation in Conversation.objects.filter(customer=member):
                contractor_id = conversation.contractor_id or member.contractor_id
                existing = Conversation.objects.filter(customer=canonical, contractor_id=contractor_id, painter__isnull=True).exclude(pk=conversation.pk).first()
                if existing:
                    Message.objects.filter(conversation=conversation).update(conversation=existing)
                    conversation.delete()
                else:
                    conversation.customer_id = canonical.id
                    conversation.contractor_id = contractor_id
                    conversation.connection_id = connections.get(contractor_id).id if connections.get(contractor_id) else None
                    conversation.save(update_fields=("customer", "contractor", "connection"))
            if member.id != canonical.id:
                for model_name in related_names:
                    apps.get_model("quotations", model_name).objects.filter(customer=member).update(customer_id=canonical.id)

        for quotation in Quotation.objects.filter(customer_id__in=[item.id for item in members]):
            connection = connections.get(quotation.contractor_id)
            if connection is None:
                connection, _ = Connection.objects.get_or_create(customer=canonical, contractor_id=quotation.contractor_id, defaults={"status": "CONNECTED", "approval_method": "INITIAL_CREATOR", "connected_at": now, "approved_at": now})
                connections[quotation.contractor_id] = connection
            quotation.customer_id = canonical.id
            quotation.connection_id = connection.id
            quotation.save(update_fields=("customer", "connection"))
        for duplicate in members:
            if duplicate.id != canonical.id:
                duplicate.delete()
        canonical.portal_user_id = portal_user.id if portal_user else None
        canonical.save(update_fields=("portal_user",))
        if portal_user and portal_user.bharath_id != canonical.bharath_id:
            portal_user.bharath_id = canonical.bharath_id
            portal_user.save(update_fields=("bharath_id",))

    for property_id, contractor_id in Measurement.objects.values_list("property_id", "contractor_id").distinct():
        records = Measurement.objects.filter(property_id=property_id, contractor_id=contractor_id).order_by("measured_on", "id")
        for version, measurement in enumerate(records, start=1):
            measurement.version = version
            measurement.save(update_fields=("version",))


class Migration(migrations.Migration):
    dependencies = [("quotations", "0068_alter_measurementopening_opening_type"), migrations.swappable_dependency(settings.AUTH_USER_MODEL)]
    operations = [
        migrations.AddField(
            model_name="customer",
            name="normalized_mobile",
            field=models.CharField(blank=True, max_length=16, null=True),
        ),
        migrations.AlterField(
            model_name="customer",
            name="bharath_id",
            field=models.CharField(blank=True, max_length=30, null=True, unique=True),
        ),
        migrations.AlterField(
            model_name="customer",
            name="contractor",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="quotation_customers", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AlterField(
            model_name="chatconversation",
            name="customer",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="conversations", to="quotations.customer"),
        ),
        migrations.CreateModel(
            name="ContractorCustomerConnection",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("status", models.CharField(choices=[("PENDING", "Pending"), ("CONNECTED", "Connected"), ("REJECTED", "Rejected"), ("DISCONNECTED", "Disconnected"), ("BLOCKED", "Blocked")], default="PENDING", max_length=20)),
                ("requested_at", models.DateTimeField(default=django.utils.timezone.now)),
                ("connected_at", models.DateTimeField(blank=True, null=True)),
                ("approved_at", models.DateTimeField(blank=True, null=True)),
                ("rejected_at", models.DateTimeField(blank=True, null=True)),
                ("disconnected_at", models.DateTimeField(blank=True, null=True)),
                ("blocked_at", models.DateTimeField(blank=True, null=True)),
                ("approval_method", models.CharField(blank=True, choices=[("CUSTOMER_PORTAL", "Customer portal"), ("INITIAL_CREATOR", "Initial creator"), ("ADMIN", "Admin")], max_length=30)),
                ("rejection_reason", models.CharField(blank=True, max_length=80)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("updated_at", models.DateTimeField(auto_now=True)),
                ("contractor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="customer_connections", to=settings.AUTH_USER_MODEL)),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="contractor_connections", to="quotations.customer")),
                ("requested_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="customer_connections_requested", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("-requested_at", "-id")},
        ),
        migrations.AddConstraint(
            model_name="contractorcustomerconnection",
            constraint=models.UniqueConstraint(fields=("customer", "contractor"), name="unique_customer_contractor_connection"),
        ),
        migrations.AddField(
            model_name="property",
            name="connection",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="properties", to="quotations.contractorcustomerconnection"),
        ),
        migrations.AddField(
            model_name="property",
            name="contractor",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="customer_properties", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="propertymeasurement",
            name="connection",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="measurements", to="quotations.contractorcustomerconnection"),
        ),
        migrations.AddField(
            model_name="propertymeasurement",
            name="created_by",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="area_calculations_created", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddField(
            model_name="propertymeasurement",
            name="version",
            field=models.PositiveIntegerField(default=1),
        ),
        migrations.AddField(
            model_name="quotation",
            name="connection",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="quotations", to="quotations.contractorcustomerconnection"),
        ),
        migrations.AddField(
            model_name="chatconversation",
            name="connection",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name="conversations", to="quotations.contractorcustomerconnection"),
        ),
        migrations.CreateModel(
            name="CustomerConnectionAudit",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("performed_by_role", models.CharField(blank=True, max_length=30)),
                ("action", models.CharField(choices=[("CONNECTION_REQUESTED", "Connection requested"), ("CONNECTION_ACCEPTED", "Connection accepted"), ("CONNECTION_REJECTED", "Connection rejected"), ("CONNECTION_DISCONNECTED", "Connection disconnected"), ("CONTRACTOR_BLOCKED", "Contractor blocked"), ("CONNECTION_REQUEST_RESENT", "Connection request resent")], max_length=40)),
                ("timestamp", models.DateTimeField(auto_now_add=True)),
                ("ip_address", models.GenericIPAddressField(blank=True, null=True)),
                ("user_agent", models.CharField(blank=True, max_length=255)),
                ("connection", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="audit_entries", to="quotations.contractorcustomerconnection")),
                ("contractor", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="customer_connection_audits", to=settings.AUTH_USER_MODEL)),
                ("customer", models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name="connection_audits", to="quotations.customer")),
                ("performed_by", models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="performed_connection_audits", to=settings.AUTH_USER_MODEL)),
            ],
            options={"ordering": ("-timestamp",)},
        ),
        migrations.RunPython(forward_global_customers, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="customer",
            name="normalized_mobile",
            field=models.CharField(max_length=16, unique=True),
        ),
        migrations.AlterField(
            model_name="customer",
            name="portal_user",
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name="customer_profiles", to=settings.AUTH_USER_MODEL),
        ),
        migrations.AddConstraint(
            model_name="chatconversation",
            constraint=models.UniqueConstraint(condition=models.Q(("contractor__isnull", False), ("customer__isnull", False)), fields=("customer", "contractor"), name="unique_customer_contractor_conversation"),
        ),
    ]
