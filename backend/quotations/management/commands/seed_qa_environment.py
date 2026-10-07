import os
from datetime import timedelta
from decimal import Decimal

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections, transaction
from django.utils import timezone

from accounts.mobile import normalize_mobile
from accounts.models import BharathUser, ContractorCustomerReview, ContractorProfile, PainterProfile
from billing.models import BillingPlan, PackageRequest, Subscription
from jobs.models import (
    ApplicatorAttendance,
    ApplicatorAvailabilityBlock,
    ApplicatorBooking,
    ApplicatorLedgerEntry,
    ContractorApplicatorTeam,
    Job,
    JobApplication,
    PainterSeekingPost,
    WorkSchedule,
    WorkSchedulePainter,
)
from quotations.models import (
    ActivityLog,
    ChatConversation,
    ChatMessage,
    Customer,
    ContractorCustomerConnection,
    CustomerConnectionAudit,
    Invoice,
    InvoicePayment,
    Lead,
    MeasurementSurface,
    PaintBrand,
    PaintType,
    Property,
    PropertyMeasurement,
    PropertyRoom,
    Quotation,
    QuotationItem,
    QuotationRoom,
    ServiceCategory,
    ServiceRequest,
    ServiceType,
    SupportTicket,
    Unit,
)


QA_PREFIX = "QA-"
PASSWORDS = {
    "admin": "QA-Admin-2026!",
    "contractor": "QA-Contractor-2026!",
    "customer": "QA-Customer-2026!",
    "painter_freelance": "QA-Painter-2026!",
    "painter_inhouse": "QA-InHouse-2026!",
}


class Command(BaseCommand):
    help = "Create or update an isolated, development-only QA portal dataset."

    def add_arguments(self, parser):
        parser.add_argument("--confirm", action="store_true", help="Confirm that this is an intentional QA seed run.")
        parser.add_argument("--allow-non-sqlite", action="store_true", help="Allow a non-SQLite database only when QA_SEED_ALLOW_NON_SQLITE=1 is also set.")

    def handle(self, *args, **options):
        self._guard(options)
        with transaction.atomic():
            records = self._seed()
        self.stdout.write(self.style.SUCCESS("QA environment seeded idempotently."))
        self.stdout.write("Accounts:")
        for key, user in records["users"].items():
            self.stdout.write(f"  {key}: {user.mobile} / {PASSWORDS[key]} ({user.bharath_id})")
        self.stdout.write("Linked records:")
        for key, value in records["counts"].items():
            self.stdout.write(f"  {key}: {value}")
        self.stdout.write("No browser QA or destructive workflow actions were performed.")

    def _guard(self, options):
        if not settings.DEBUG:
            raise CommandError("Refusing to seed QA data while DJANGO_DEBUG is false.")
        if os.environ.get("QA_SEED_ENABLED") != "1":
            raise CommandError("Set QA_SEED_ENABLED=1 for this development-only command.")
        if not options["confirm"]:
            raise CommandError("Pass --confirm to acknowledge that this creates QA records.")
        database = connections["default"].settings_dict
        engine = database.get("ENGINE", "")
        if "sqlite3" not in engine and not (options["allow_non_sqlite"] and os.environ.get("QA_SEED_ALLOW_NON_SQLITE") == "1"):
            raise CommandError("Refusing non-SQLite databases unless --allow-non-sqlite and QA_SEED_ALLOW_NON_SQLITE=1 are explicitly set.")

    def _seed(self):
        today = timezone.localdate()
        users = {
            "admin": self._user("9000019001", "QA Admin", "QA-ADMIN-001", PASSWORDS["admin"], BharathUser.Roles.ADMIN, is_staff=True, is_superuser=True),
            "contractor": self._user("9000019002", "QA Contractor", "QA-CONTRACTOR-001", PASSWORDS["contractor"], BharathUser.Roles.CONTRACTOR),
            "customer": self._user("9000019003", "QA Customer", "QA-CUSTOMER-001", PASSWORDS["customer"], BharathUser.Roles.CUSTOMER),
            "painter_freelance": self._user("9000019004", "QA Freelance Painter", "QA-PAINTER-FREELANCE", PASSWORDS["painter_freelance"], BharathUser.Roles.PAINTER),
            "painter_inhouse": self._user("9000019005", "QA In-house Painter", "QA-PAINTER-INHOUSE", PASSWORDS["painter_inhouse"], BharathUser.Roles.PAINTER),
        }
        contractor_profile, _ = ContractorProfile.objects.get_or_create(user=users["contractor"], defaults={"company_name": "QA Painting Services", "owner_name": users["contractor"].get_full_name()})
        contractor_profile.company_name = "QA Painting Services"
        contractor_profile.owner_name = users["contractor"].get_full_name()
        contractor_profile.service_areas = "QA Bengaluru"
        contractor_profile.number_of_painters = 2
        contractor_profile.save()
        for key, location in (("painter_freelance", "QA Whitefield"), ("painter_inhouse", "QA HSR Layout")):
            profile, _ = PainterProfile.objects.get_or_create(user=users[key])
            profile.experience_years = 4 if key == "painter_freelance" else 7
            profile.skills = "Interior Painting, Wall Putty, Primer"
            profile.preferred_locations = location
            profile.current_location = location
            profile.daily_wage = Decimal("1800")
            profile.weekly_wage = Decimal("10000")
            profile.availability = PainterProfile.Availability.AVAILABLE
            profile.save()

        customer_mobile = normalize_mobile(users["customer"].mobile)
        if not customer_mobile:
            raise CommandError("The reserved QA customer mobile could not be normalized.")
        customer, _ = Customer.objects.get_or_create(normalized_mobile=customer_mobile, defaults={"mobile": customer_mobile, "name": "QA Customer", "contractor": users["contractor"]})
        customer.name = "QA Customer"
        customer.mobile = customer_mobile
        customer.contractor = users["contractor"]
        customer.portal_user = users["customer"]
        customer.address = "QA Test Street"
        customer.city = "QA Bengaluru"
        customer.pincode = "560001"
        customer.status = Customer.Status.WON
        customer.save()
        connection, _ = ContractorCustomerConnection.objects.get_or_create(customer=customer, contractor=users["contractor"], defaults={"requested_by": users["contractor"]})
        connection.status = ContractorCustomerConnection.Status.CONNECTED
        connection.requested_by = users["contractor"]
        connection.approval_method = ContractorCustomerConnection.ApprovalMethod.ADMIN
        connection.connected_at = connection.connected_at or timezone.now()
        connection.approved_at = connection.approved_at or timezone.now()
        connection.save()
        if not connection.audit_entries.filter(action=CustomerConnectionAudit.Actions.ACCEPTED).exists():
            CustomerConnectionAudit.objects.create(connection=connection, customer=customer, contractor=users["contractor"], performed_by=users["admin"], performed_by_role="ADMIN", action=CustomerConnectionAudit.Actions.ACCEPTED)

        category, _ = ServiceCategory.objects.get_or_create(name="QA Painting", defaults={"created_by": users["contractor"], "workspace_name": "QA Painting Services", "contractor_label": "Painter", "employee_singular_label": "Painter", "employee_plural_label": "Painters"})
        service, _ = ServiceType.objects.get_or_create(name="QA Interior Painting", defaults={"created_by": users["contractor"], "category_master": category, "category": "QA Painting", "calculation_type": ServiceType.CalculationType.WALL})
        paint_type, _ = PaintType.objects.get_or_create(name="QA Premium Emulsion", defaults={"created_by": users["contractor"], "service_category": category, "default_price": Decimal("28")})
        brand, _ = PaintBrand.objects.get_or_create(name="QA Paint Brand", defaults={"created_by": users["contractor"]})
        unit, _ = Unit.objects.get_or_create(name="QA Sq Ft", defaults={"created_by": users["contractor"]})
        category.units.add(unit)

        site, _ = Property.objects.get_or_create(customer=customer, name="QA Test Home", defaults={"contractor": users["contractor"], "connection": connection, "property_type": Property.PropertyType.TWO_BHK, "address": "QA Test Street", "city": "QA Bengaluru", "pincode": "560001"})
        site.contractor = users["contractor"]
        site.connection = connection
        site.save()
        lead, _ = Lead.objects.get_or_create(reference_no="QA-OPP-001", defaults={"contractor": users["contractor"], "customer": customer, "property": site, "service_type": service, "title": "QA Interior repaint opportunity", "description": "QA opportunity", "stage": "IN_PROGRESS", "source": "REFERRAL", "priority": "HIGH", "estimated_value": Decimal("59000")})
        measurement, _ = PropertyMeasurement.objects.get_or_create(reference_no="QA-BPM-001", defaults={"property": site, "contractor": users["contractor"], "connection": connection, "created_by": users["contractor"], "status": PropertyMeasurement.Status.LOCKED, "notes": "QA measurement record"})
        measurement.property = site
        measurement.contractor = users["contractor"]
        measurement.connection = connection
        measurement.created_by = users["contractor"]
        measurement.status = PropertyMeasurement.Status.LOCKED
        measurement.save()
        room, _ = PropertyRoom.objects.get_or_create(property=site, name="QA Living Room", defaults={"measurement_record": measurement, "length": 20, "width": 15, "height": 10})
        room.measurement_record = measurement
        room.save()
        surface, _ = MeasurementSurface.objects.get_or_create(property=site, measurement_record=measurement, room=room, name="QA Living Room Walls", defaults={"work_area": MeasurementSurface.WorkArea.INTERIOR, "surface_type": MeasurementSurface.SurfaceType.WALL, "length": 20, "breadth": 15, "quantity": 1, "rate": 28})
        surface.measurement_record = measurement
        surface.save()

        quotes = []
        for number, status in (("QA-QTN-SENT", Quotation.Status.SENT), ("QA-QTN-ACCEPTED", Quotation.Status.ACCEPTED), ("QA-QTN-ACTIVE", Quotation.Status.IN_PROGRESS), ("QA-QTN-COMPLETED", Quotation.Status.COMPLETED)):
            quote, _ = Quotation.objects.get_or_create(quotation_number=number, defaults={"contractor": users["contractor"], "customer": customer, "property": site, "connection": connection, "measurement_record": measurement, "status": status, "quotation_type": Quotation.QuotationType.MEASUREMENT, "subtotal": Decimal("50000"), "grand_total": Decimal("59000"), "gst_percentage": Decimal("18"), "gst_amount": Decimal("9000"), "notes": "QA quotation"})
            quote.contractor = users["contractor"]
            quote.customer = customer
            quote.property = site
            quote.connection = connection
            quote.measurement_record = measurement
            quote.status = status
            quote.subtotal = Decimal("50000")
            quote.gst_percentage = Decimal("18")
            quote.gst_amount = Decimal("9000")
            quote.grand_total = Decimal("59000")
            quote.save()
            qroom, _ = QuotationRoom.objects.get_or_create(quotation=quote, name="QA Living Room")
            QuotationItem.objects.get_or_create(quotation=quote, room=qroom, description="QA Interior wall painting", defaults={"service_category": category, "service_type": service, "paint_type": paint_type, "paint_brand": brand, "quantity": Decimal("1800"), "unit": unit, "rate": Decimal("28"), "amount": Decimal("50000")})
            quotes.append(quote)

        schedules = []
        schedule_data = ((quotes[1], WorkSchedule.Status.CONFIRMED, today + timedelta(days=7), today + timedelta(days=9)), (quotes[2], WorkSchedule.Status.IN_PROGRESS, today - timedelta(days=2), today + timedelta(days=2)), (quotes[3], WorkSchedule.Status.COMPLETED, today - timedelta(days=20), today - timedelta(days=18)))
        for quote, status, start, end in schedule_data:
            schedule, _ = WorkSchedule.objects.get_or_create(quotation=quote, defaults={"proposed_start_date": start, "proposed_end_date": end, "proposed_by": users["contractor"]})
            schedule.proposed_start_date = start
            schedule.proposed_end_date = end
            schedule.proposed_by = users["contractor"]
            schedule.customer_accepted = True
            schedule.contractor_accepted = True
            schedule.status = status
            schedule.payment_status = WorkSchedule.PaymentStatus.CONFIRMED
            if status == WorkSchedule.Status.IN_PROGRESS:
                schedule.work_started_at = schedule.work_started_at or timezone.now()
            if status == WorkSchedule.Status.COMPLETED:
                schedule.work_started_at = schedule.work_started_at or timezone.now() - timedelta(days=20)
                schedule.work_completed_at = schedule.work_completed_at or timezone.now() - timedelta(days=18)
            schedule.save()
            schedules.append(schedule)

        inhouse_team, _ = ContractorApplicatorTeam.objects.get_or_create(contractor=users["contractor"], painter=users["painter_inhouse"], defaults={"employment_type": ContractorApplicatorTeam.EmploymentType.IN_HOUSE, "employee_code": "QA-EMP-001", "joined_on": today - timedelta(days=120), "salary_basis": ContractorApplicatorTeam.SalaryBasis.MONTHLY, "salary_amount": Decimal("30000")})
        active_assignment, _ = WorkSchedulePainter.objects.get_or_create(schedule=schedules[1], painter=users["painter_inhouse"], defaults={"status": WorkSchedulePainter.Status.IN_PROGRESS, "wage_type": WorkSchedulePainter.WageType.DAILY, "agreed_wage": Decimal("1800")})
        active_assignment.status = WorkSchedulePainter.Status.IN_PROGRESS
        active_assignment.save()
        completed_assignment, _ = WorkSchedulePainter.objects.get_or_create(schedule=schedules[2], painter=users["painter_freelance"], defaults={"status": WorkSchedulePainter.Status.COMPLETED, "agreed_wage": Decimal("1800")})
        completed_assignment.status = WorkSchedulePainter.Status.COMPLETED
        completed_assignment.save()
        ApplicatorAvailabilityBlock.objects.get_or_create(applicator=users["painter_freelance"], start_date=today + timedelta(days=20), end_date=today + timedelta(days=22), defaults={"reason": "QA blocked dates"})
        ApplicatorAttendance.objects.get_or_create(membership=inhouse_team, date=today, defaults={"status": ApplicatorAttendance.Status.PRESENT, "schedule": schedules[1], "overtime_hours": Decimal("1.5")})
        ApplicatorLedgerEntry.objects.get_or_create(membership=inhouse_team, date=today, entry_type=ApplicatorLedgerEntry.EntryType.EARNING, schedule=schedules[1], defaults={"amount": Decimal("1800"), "note": "QA earning"})
        post, _ = PainterSeekingPost.objects.get_or_create(painter=users["painter_freelance"], title="QA Painter availability", defaults={"description": "QA available job post", "skills": "Interior Painting", "preferred_location": "QA Bengaluru", "city": "QA Bengaluru", "pincode": "560001", "available_from": today, "wage_type": PainterSeekingPost.WageType.DAILY, "expected_wage": Decimal("1800")})
        job, _ = Job.objects.get_or_create(contractor=users["contractor"], title="QA Available Painting Job", defaults={"description": "QA open job", "service_type": "QA Interior Painting", "location": "QA Test Street", "city": "QA Bengaluru", "pincode": "560001", "job_type": Job.JobType.DAILY, "number_of_painters": 1, "required_skills": "Interior Painting", "daily_wage": Decimal("1800"), "start_date": today + timedelta(days=14), "estimated_days": 3, "status": Job.Status.OPEN})
        JobApplication.objects.get_or_create(job=job, painter=users["painter_freelance"], defaults={"message": "QA application", "status": JobApplication.Status.APPLIED})
        ApplicatorBooking.objects.get_or_create(contractor=users["contractor"], applicator=users["painter_freelance"], seeking_post=post, work_type="QA Interior Painting", defaults={"pincode": "560001", "start_date": today + timedelta(days=14), "end_date": today + timedelta(days=16), "agreed_wage": Decimal("1800"), "status": ApplicatorBooking.Status.PENDING})

        customer_chat, _ = ChatConversation.objects.get_or_create(customer=customer, contractor=users["contractor"], connection=connection)
        self._message(customer_chat, users["contractor"], "QA contractor message")
        painter_chat, _ = ChatConversation.objects.get_or_create(contractor=users["contractor"], painter=users["painter_freelance"])
        self._message(painter_chat, users["painter_freelance"], "QA painter message")
        ServiceRequest.objects.get_or_create(customer=customer, connection=connection, title="QA service request", defaults={"service_type": service, "description": "QA request", "preferred_date": today + timedelta(days=5), "address": "QA Test Street", "status": ServiceRequest.Status.NEW})
        SupportTicket.objects.get_or_create(customer=customer, connection=connection, requester=users["customer"], subject="QA support ticket", defaults={"category": SupportTicket.Category.SERVICE, "priority": SupportTicket.Priority.MEDIUM, "description": "QA support issue", "status": SupportTicket.Status.OPEN})
        ContractorCustomerReview.objects.get_or_create(contractor=contractor_profile, customer=users["customer"], defaults={"rating": 5, "comment": "QA completed work review"})

        invoice, _ = Invoice.objects.get_or_create(invoice_number="QA-INV-001", defaults={"contractor": users["contractor"], "quotation": quotes[3], "customer": customer, "site_property": site, "customer_name": customer.name, "customer_mobile": customer.mobile, "property_name": site.name, "quotation_number_snapshot": quotes[3].quotation_number, "subtotal": Decimal("50000"), "gst_amount": Decimal("9000"), "grand_total": Decimal("59000"), "amount_paid": Decimal("25000"), "status": Invoice.Status.PART_PAID, "due_date": today + timedelta(days=14), "items": [{"description": "QA Interior wall painting", "amount": "50000"}]})
        InvoicePayment.objects.get_or_create(invoice=invoice, payment_reference="QA-PAY-001", defaults={"amount": Decimal("25000"), "payment_mode": Invoice.PaymentMode.UPI, "received_date": today})
        plan, _ = BillingPlan.objects.get_or_create(name="QA Painter Plan", audience=BillingPlan.Audience.PAINTER, defaults={"billing_cycle": BillingPlan.Cycle.MONTHLY, "price": Decimal("499"), "validity": BillingPlan.Validity.ONE_MONTH, "availability_calendar": True, "booking_requests": True, "contractor_job_access": True})
        subscription, _ = Subscription.objects.get_or_create(user=users["painter_freelance"], plan=plan, defaults={"start_date": today, "end_date": today + timedelta(days=30), "is_active": True})
        PackageRequest.objects.get_or_create(user=users["painter_freelance"], plan=plan, defaults={"status": PackageRequest.Status.APPROVED, "requested_start_date": today, "requested_end_date": today + timedelta(days=30), "amount": Decimal("499"), "payment_status": PackageRequest.PaymentStatus.CONFIRMED, "subscription": subscription})
        ActivityLog.objects.get_or_create(actor=users["admin"], action=ActivityLog.Actions.CREATE, module="QA seed", description="Created QA environment records", method="seed", path="seed_qa_environment", object_id="QA")

        return {"users": users, "counts": {"customers": 1, "connections": 1, "properties": 1, "measurements": 1, "leads": 1, "quotations": len(quotes), "schedules": len(schedules), "painter_assignments": 2, "jobs": 1, "applications": 1, "bookings": 1, "attendance": 1, "ledger_entries": 1, "chats": 2, "service_requests": 1, "support_tickets": 1, "invoices": 1, "billing_plans": 1, "subscriptions": 1, "package_requests": 1}}

    def _user(self, mobile, name, bharath_id, password, role, **flags):
        first, last = name.split(" ", 1)
        user = BharathUser.objects.filter(mobile=mobile).first()
        if user and (not user.bharath_id or not user.bharath_id.startswith(QA_PREFIX)):
            raise CommandError(f"Refusing to modify existing non-QA user with mobile {mobile}.")
        if not user:
            user = BharathUser(mobile=mobile)
        user.first_name = first
        user.last_name = last
        user.email = f"{mobile}@qa.example.test"
        user.role = role
        user.bharath_id = bharath_id
        user.is_active = True
        user.is_verified = True
        user.verification_status = BharathUser.VerificationStatus.VERIFIED
        for key, value in flags.items():
            setattr(user, key, value)
        user.set_password(password)
        user.save()
        return user

    @staticmethod
    def _message(conversation, sender, text):
        ChatMessage.objects.get_or_create(conversation=conversation, sender=sender, text=text)
