from concurrent.futures import ThreadPoolExecutor
from threading import Event

from django.db import close_old_connections, connections, transaction
from django.test import TransactionTestCase, skipUnlessDBFeature
from rest_framework.test import APIClient

from call_inbox.test_booking import BookingFixtures
from .models import Customer, ContractorCustomerConnection, Property


class BookingConnectionConcurrencyTests(BookingFixtures, TransactionTestCase):
    @skipUnlessDBFeature("has_select_for_update")
    def test_disconnect_serializes_with_customer_then_connection_booking(self):
        customer_locked, action_at_lock = Event(), Event()

        def booking_locks():
            close_old_connections()
            try:
                with transaction.atomic():
                    Customer.objects.select_for_update().get(pk=self.customer.pk)
                    customer_locked.set()
                    if not action_at_lock.wait(15):
                        return "disconnect never reached its first lock"
                    ContractorCustomerConnection.objects.select_for_update().get(pk=self.connection.pk)
                return 200
            except Exception as error:
                return type(error).__name__
            finally:
                close_old_connections()

        def disconnect():
            close_old_connections()
            try:
                if not customer_locked.wait(15):
                    return "booking never locked customer"
                first_lock = {"seen": False}

                def observe(execute, sql, params, many, context):
                    if ("FOR UPDATE" in sql or "FOR NO KEY UPDATE" in sql) and not first_lock["seen"]:
                        first_lock["seen"] = True
                        # Force the old unrestricted join's connection-first
                        # acquisition so this regression cannot depend on the
                        # PostgreSQL query planner or thread scheduling.
                        if '"quotations_contractorcustomerconnection"' in sql:
                            execute('SELECT id FROM "quotations_contractorcustomerconnection" WHERE id = %s FOR UPDATE',
                                    [self.connection.pk], False, context)
                        action_at_lock.set()
                    return execute(sql, params, many, context)

                client = APIClient()
                client.force_authenticate(self.portal)
                client.raise_request_exception = False
                with connections["default"].execute_wrapper(observe):
                    return client.post(f"/api/quotations/customer/contractors/{self.connection.pk}/disconnect/", {}, format="json").status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            booking = pool.submit(booking_locks)
            action = pool.submit(disconnect)
            self.assertEqual((booking.result(timeout=25), action.result(timeout=25)), (200, 200))
        self.connection.refresh_from_db()
        self.assertEqual(self.connection.status, "DISCONNECTED")
        self.assertEqual(self.client.post(self.url, self.payload, format="json").status_code, 409)

    @skipUnlessDBFeature("has_select_for_update", "has_select_for_no_key_update")
    def test_booking_parent_lock_allows_existing_connection_holder_to_insert_customer_fk(self):
        connection_locked, customer_locked = Event(), Event()

        def existing_property_flow():
            close_old_connections()
            try:
                with transaction.atomic():
                    ContractorCustomerConnection.objects.select_for_update().get(pk=self.connection.pk)
                    connection_locked.set()
                    if not customer_locked.wait(15):
                        return "booking never locked customer"
                    Property.objects.create(contractor=self.owner, customer=self.customer, name="Existing FK flow")
                return 200
            except Exception as error:
                return type(error).__name__
            finally:
                close_old_connections()

        def booking():
            close_old_connections()
            try:
                if not connection_locked.wait(15):
                    return "existing flow never locked connection"

                def observe(execute, sql, params, many, context):
                    result = execute(sql, params, many, context)
                    if '"quotations_customer"' in sql and "FOR " in sql:
                        customer_locked.set()
                    return result

                client = APIClient()
                client.force_authenticate(self.owner)
                client.raise_request_exception = False
                with connections["default"].execute_wrapper(observe):
                    return client.post(self.url, self.payload, format="json").status_code
            finally:
                close_old_connections()

        with ThreadPoolExecutor(max_workers=2) as pool:
            existing = pool.submit(existing_property_flow)
            booked = pool.submit(booking)
            self.assertEqual((existing.result(timeout=25), booked.result(timeout=25)), (200, 201))
