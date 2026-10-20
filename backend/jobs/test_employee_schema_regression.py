from datetime import timedelta

from django.db import DatabaseError, connection
from django.db.migrations.executor import MigrationExecutor
from django.test import TransactionTestCase
from django.urls import reverse
from django.utils import timezone
from rest_framework.test import APIClient

from accounts.models import BharathUser
from jobs.models import ContractorApplicatorTeam


class EmployeeSchemaRegressionTests(TransactionTestCase):
    """Prove pre-Phase-2 API failure and recovery after all current migrations."""

    migrate_from = [('jobs', '0029_workschedule_customer_contact')]
    reset_sequences = True

    def tearDown(self):
        # MigrationExecutor only moves this isolated Django test database. Leave it
        # at the current code's leaf state before TransactionTestCase flushes it.
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
        super().tearDown()

    def test_employee_directory_missing_phase2_column_and_migrated_schema(self):
        verified = {
            'is_verified': True,
            'verification_status': BharathUser.VerificationStatus.VERIFIED,
        }
        contractor = BharathUser.objects.create_user(
            mobile='9000000781', role=BharathUser.Roles.CONTRACTOR, **verified,
        )
        painter = BharathUser.objects.create_user(
            mobile='9000000782', role=BharathUser.Roles.PAINTER, **verified,
        )
        member = ContractorApplicatorTeam.objects.create(
            contractor=contractor,
            painter=painter,
            employment_type=ContractorApplicatorTeam.EmploymentType.IN_HOUSE,
            salary_basis=ContractorApplicatorTeam.SalaryBasis.DAILY,
            salary_amount=500,
        )
        self.client = APIClient()
        self.client.force_authenticate(contractor)

        MigrationExecutor(connection).migrate(self.migrate_from)
        with self.assertRaisesRegex(DatabaseError, 'source_attendance_id|contractorapplicatorteam\\.trade'):
            self.client.get(reverse('in-house-applicator-list'))

        # The API runs current model code, including columns added after
        # Phase 2. Recovery must apply the complete current migration graph.
        executor = MigrationExecutor(connection)
        executor.migrate(executor.loader.graph.leaf_nodes())
        response = self.client.get(reverse('in-house-applicator-list'))
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['membership_id'], member.pk)
        self.assertEqual(response.data[0]['id'], painter.pk)
        self.assertEqual(response.data[0]['total_earnings'], 0)

        detail = self.client.get(reverse('in-house-applicator-detail', args=(member.pk,)))
        self.assertEqual(detail.status_code, 200)
        attendance = self.client.post(
            reverse('in-house-attendance', args=(member.pk,)),
            {'date': str(timezone.localdate() - timedelta(days=1)), 'status': 'PRESENT'},
            format='json',
        )
        self.assertEqual(attendance.status_code, 201)
