from io import BytesIO
import re
from django.core import mail
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from openpyxl import Workbook
from rest_framework.authtoken.models import Token
from .tests import BaseAPITestCase
from .models import Asset, AssetActionRequest, Employee, HealthCheckSession, HealthCheckResponse, SuperCategory


class AdditionalQARegressionTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        self.employee.user = self.user
        self.employee.save()
        self.category = SuperCategory.objects.get(code='furniture')
        self.asset = Asset.objects.create(miczon_id='F-1', name='Chair', super_category=self.category, custodian=self.employee)
        self.session = HealthCheckSession.objects.create(title='Furniture', super_category=self.category)
        self.client.force_authenticate(self.admin)

    def test_bulk_inspection_rolls_back_invalid_later_row(self):
        second = Asset.objects.create(miczon_id='F-2', name='Desk', super_category=self.category, custodian=self.employee)
        session = HealthCheckSession.objects.create(title='Two items', super_category=self.category)
        response = self.client.post('/api/health-responses/bulk-submit/', {'employee': self.employee.pk, 'session': session.pk, 'responses': [
            {'asset': self.asset.pk, 'surface_finish': 'SEVERELY_DAMAGED'}, {'asset': second.pk, 'performance_rating': 9}]}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertFalse(HealthCheckResponse.objects.filter(session=session).exists())

    def test_legacy_reconciliation_preview_is_read_only_and_apply_is_idempotent(self):
        from django.core.management import call_command
        from io import StringIO
        self.asset.assignments.all().delete()
        output = StringIO()
        call_command('reconcile_assignments', stdout=output)
        self.assertFalse(self.asset.assignments.exists())
        call_command('reconcile_assignments', apply=True, stdout=output)
        call_command('reconcile_assignments', apply=True, stdout=output)
        self.assertEqual(self.asset.assignments.count(), 1)
        self.asset.refresh_from_db()
        self.assertEqual(self.asset.custodian_id, self.employee.pk)
        self.assertIn('Original assignment date is unknown', self.asset.assignments.get().remarks)

    def test_malformed_inspection_requests_return_400(self):
        for payload in [
            {'employee': 'invalid', 'session': self.session.pk, 'responses': []},
            {'employee': self.employee.pk, 'session': 'invalid', 'responses': []},
            {'employee': self.employee.pk, 'session': self.session.pk, 'responses': ['bad-row']},
        ]:
            with self.subTest(payload=payload):
                self.assertEqual(self.client.post('/api/health-responses/bulk-submit/', payload, format='json').status_code, 400)
        self.assertEqual(self.client.get(f'/api/health-checks/{self.session.pk}/pending-assets/?employee=invalid').status_code, 400)

    def test_selected_return_rejects_foreign_asset_atomically(self):
        outsider = Employee.objects.create(name='Outside', employee_id='OUTSIDE')
        other = Asset.objects.create(miczon_id='OUT-1', name='Desk', custodian=outsider)
        response = self.client.post(f'/api/employees/{self.employee.pk}/unassign-all/', {'asset_ids': [self.asset.pk, other.pk]}, format='json')
        self.assertEqual(response.status_code, 400)
        self.asset.refresh_from_db()
        self.assertEqual(self.asset.custodian_id, self.employee.pk)

    def test_appliance_answers_and_category_labels(self):
        category = SuperCategory.objects.get(code='appliances')
        appliance = Asset.objects.create(miczon_id='AC-1', name='AC', super_category=category, custodian=self.employee)
        session = HealthCheckSession.objects.create(title='Appliances', super_category=category)
        response = self.client.post('/api/health-responses/bulk-submit/', {'employee': self.employee.pk, 'session': session.pk, 'responses': [
            {'asset': appliance.pk, 'cooling_heating_perf': 'NOT_WORKING', 'power_cord_plug': 'SAFETY_HAZARD', 'performance_rating': 1}]}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        row = HealthCheckResponse.objects.get(session=session)
        self.assertEqual(row.power_cord_plug, 'SAFETY_HAZARD')
        report = self.client.get(f'/api/reports/health-compliance/?session={session.pk}')
        findings = report.data['responses'][0]['inspection_findings']
        self.assertTrue(any('Electrical' in item['label'] and 'Safety Hazard' in item['value'] for item in findings))
        self.assertFalse(any('Battery' in item['label'] for item in findings))

    def test_manager_can_submit_valid_asset_request_but_not_create_directly(self):
        self.dept.manager = self.employee
        self.dept.save()
        self.client.force_authenticate(self.user)
        response = self.client.post('/api/assets/', {'miczon_id': 'MAN-1', 'name': 'New Chair', 'super_category': self.category.pk}, format='json')
        self.assertEqual(response.status_code, 201, response.data)
        self.assertFalse(Asset.objects.filter(miczon_id='MAN-1').exists())
        request = AssetActionRequest.objects.get(action_type='ADD')
        self.assertEqual(request.submitted_by_id, self.user.pk)
        self.client.force_authenticate(self.admin)
        self.assertEqual(self.client.post(f'/api/requests/{request.pk}/approve/').status_code, 200)
        self.assertEqual(Asset.objects.get(miczon_id='MAN-1').super_category_id, self.category.pk)

    def test_invalid_asset_approval_keeps_request_pending(self):
        request = AssetActionRequest.objects.create(requester=self.employee, action_type='ADD', asset_data={'miczon_id': 'BAD', 'name': 'Bad', 'current_status': 'RETIRED'})
        self.assertEqual(self.client.post(f'/api/requests/{request.pk}/approve/').status_code, 400)
        request.refresh_from_db()
        self.assertEqual(request.status, 'PENDING')
        self.assertFalse(Asset.objects.filter(miczon_id='BAD').exists())

    def test_employee_import_rejects_invalid_email(self):
        workbook = Workbook()
        workbook.active.append(['Employee Name', 'Employee ID', 'Email', 'Department'])
        workbook.active.append(['Bad Email', 'BAD-EMAIL', 'not-an-email', 'IT'])
        output = BytesIO(); workbook.save(output)
        response = self.client.post('/api/employees/import/', {'file': SimpleUploadedFile('employees.xlsx', output.getvalue())}, format='multipart')
        self.assertEqual(response.status_code, 200)
        self.assertFalse(Employee.objects.filter(employee_id='BAD-EMAIL').exists())
        self.assertTrue(response.data['errors'])


@override_settings(EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend', FRONTEND_URL='https://inventory.example')
class PasswordRecoveryTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        cache.clear()

    def test_reset_is_single_use_and_revokes_old_api_token(self):
        old_token = Token.objects.create(user=self.user)
        response = self.client.post('/api/password-reset/request/', {'email': self.user.email})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(mail.outbox), 1)
        uid, token = re.search(r'/reset-password/([^/\s]+)/([^/\s]+)', mail.outbox[0].body).groups()
        payload = {'uid': uid, 'token': token, 'new_password': 'NewSecure!2026-Reset'}
        self.assertEqual(self.client.post('/api/password-reset/validate/', payload).status_code, 200)
        self.assertEqual(self.client.post('/api/password-reset/confirm/', payload).status_code, 200)
        self.user.refresh_from_db()
        self.assertTrue(self.user.check_password(payload['new_password']))
        self.assertFalse(Token.objects.filter(pk=old_token.pk).exists())
        self.assertEqual(self.client.post('/api/password-reset/confirm/', payload).status_code, 400)

    def test_unknown_account_has_same_public_response(self):
        known = self.client.post('/api/password-reset/request/', {'email': self.user.email})
        unknown = self.client.post('/api/password-reset/request/', {'email': 'unknown@example.com'})
        self.assertEqual(known.data, unknown.data)
        self.assertEqual(len(mail.outbox), 1)

    def test_recovery_is_rate_limited(self):
        statuses = [self.client.post('/api/password-reset/request/', {'email': 'unknown@example.com'}).status_code for _ in range(11)]
        self.assertEqual(statuses[-1], 429)

    def test_malformed_reset_token_returns_validation_error(self):
        for payload in [{'uid': [], 'token': 'bad'}, {'uid': 'MQ', 'token': ['bad']}, {}]:
            self.assertEqual(self.client.post('/api/password-reset/validate/', payload, format='json').status_code, 400)
