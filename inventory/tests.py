"""
Backend test suite for the inventory app.

Runs with Django's built-in test runner (no pytest dependency):

    python manage.py test inventory

Uses DRF's APITestCase with force_authenticate so the tests don't depend on
token issuance. Covers authentication, the IsAdminUserOrReadOnly permission
model, the asset-assignment side effects, the approval workflow, and
regressions for bugs fixed during the 2026-08 QA pass.
"""
from datetime import date

from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from .models import (
    Asset, Employee, Department, AssetAssignment, AssetActionRequest,
)


class BaseAPITestCase(APITestCase):
    """Shared fixtures: one superuser admin, one regular employee user."""

    def setUp(self):
        self.admin = User.objects.create_superuser('admin', 'admin@example.com', 'pw-admin-123')
        self.user = User.objects.create_user('emp', 'emp@example.com', 'pw-emp-123')

        self.dept = Department.objects.create(name='IT')
        # Matched to self.user by email (see get_employee_filter).
        self.employee = Employee.objects.create(
            name='Emp One', employee_id='E1', email='emp@example.com', department=self.dept,
        )


class AuthTests(BaseAPITestCase):
    def test_current_user_requires_authentication(self):
        res = self.client.get('/api/auth/current-user/')
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))

    def test_current_user_returns_profile(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get('/api/auth/current-user/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertTrue(res.data['is_superuser'])


class DepartmentPermissionTests(BaseAPITestCase):
    def test_regular_user_can_read_departments(self):
        self.client.force_authenticate(self.user)
        res = self.client.get('/api/departments/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_regular_user_cannot_create_department(self):
        self.client.force_authenticate(self.user)
        res = self.client.post('/api/departments/', {'name': 'Hacked'})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
        self.assertFalse(Department.objects.filter(name='Hacked').exists())

    def test_admin_can_create_department(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/departments/', {'name': 'Finance'})
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)


class EmployeePermissionTests(BaseAPITestCase):
    def test_regular_user_cannot_create_employee(self):
        self.client.force_authenticate(self.user)
        res = self.client.post('/api/employees/', {'name': 'X', 'employee_id': 'E999'})
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_can_create_employee(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/employees/', {
            'name': 'New Hire', 'employee_id': 'E2', 'department': self.dept.id,
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.assertTrue(Employee.objects.filter(employee_id='E2').exists())


class AssetAssignmentModelTests(BaseAPITestCase):
    """The AssetAssignment.save() side effects on the parent Asset."""

    def _make_asset(self, **kwargs):
        defaults = dict(miczon_id='MZ-1', name='Laptop')
        defaults.update(kwargs)
        return Asset.objects.create(**defaults)

    def test_assigning_sets_custodian_and_status(self):
        asset = self._make_asset()
        AssetAssignment.objects.create(asset=asset, employee=self.employee, status='ASSIGNED')
        asset.refresh_from_db()
        self.assertEqual(asset.custodian, self.employee)
        self.assertEqual(asset.current_status, 'ASSIGNED')

    def test_return_good_condition_frees_asset(self):
        asset = self._make_asset()
        assignment = AssetAssignment.objects.create(asset=asset, employee=self.employee, status='ASSIGNED')
        assignment.mark_returned(returned_by='Test', condition='Good')
        asset.refresh_from_db()
        self.assertIsNone(asset.custodian)
        self.assertEqual(asset.current_status, 'AVAILABLE')

    def test_return_damaged_marks_broken(self):
        asset = self._make_asset()
        assignment = AssetAssignment.objects.create(asset=asset, employee=self.employee, status='ASSIGNED')
        assignment.mark_returned(returned_by='Test', condition='Damaged')
        asset.refresh_from_db()
        self.assertEqual(asset.current_status, 'BROKEN')


class ApprovalWorkflowTests(BaseAPITestCase):
    def test_admin_approves_add_request_creates_asset(self):
        req = AssetActionRequest.objects.create(
            requester=self.employee,
            action_type='ADD',
            asset_data={'miczon_id': 'MZ-100', 'name': 'Monitor', 'category': 'Display'},
        )
        self.client.force_authenticate(self.admin)
        res = self.client.post(f'/api/requests/{req.id}/approve/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        req.refresh_from_db()
        self.assertEqual(req.status, 'APPROVED')
        self.assertTrue(Asset.objects.filter(miczon_id='MZ-100').exists())

    def test_non_admin_cannot_approve(self):
        req = AssetActionRequest.objects.create(
            requester=self.employee, action_type='ADD',
            asset_data={'miczon_id': 'MZ-101', 'name': 'Mouse'},
        )
        self.client.force_authenticate(self.user)
        res = self.client.post(f'/api/requests/{req.id}/approve/')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_reject_marks_rejected(self):
        req = AssetActionRequest.objects.create(
            requester=self.employee, action_type='ADD',
            asset_data={'miczon_id': 'MZ-102', 'name': 'Keyboard'},
        )
        self.client.force_authenticate(self.admin)
        res = self.client.post(f'/api/requests/{req.id}/reject/', {'admin_remarks': 'Not needed'})
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        req.refresh_from_db()
        self.assertEqual(req.status, 'REJECTED')


class RepairCountRegressionTests(BaseAPITestCase):
    """Regression for the dead 'IN_REPAIR' filter: repair count == BROKEN count."""

    def setUp(self):
        super().setUp()
        Asset.objects.create(miczon_id='MZ-A', name='A', current_status='AVAILABLE')
        Asset.objects.create(miczon_id='MZ-B', name='B', current_status='BROKEN')
        Asset.objects.create(miczon_id='MZ-C', name='C', current_status='BROKEN')

    def test_dashboard_stats_repair_count(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get('/api/admin/dashboard-stats/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['total_repair'], 2)

    def test_summary_repair_count(self):
        self.client.force_authenticate(self.admin)
        res = self.client.get('/api/reports/summary/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)
        self.assertEqual(res.data['repair'], 2)


class UploadPermissionTests(BaseAPITestCase):
    """UploadAssetsView must be admin-only and guard the missing-file case."""

    def test_regular_user_forbidden(self):
        self.client.force_authenticate(self.user)
        res = self.client.post('/api/upload/', {}, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)

    def test_admin_missing_file_returns_400(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/upload/', {}, format='multipart')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class BrowserQARegressionTests(BaseAPITestCase):
    def setUp(self):
        super().setUp()
        from .models import SuperCategory, HealthCheckSession
        self.employee.user = self.user
        self.employee.save()
        self.it = SuperCategory.objects.get(code='it_assets')
        self.furniture = SuperCategory.objects.get(code='furniture')
        self.asset = Asset.objects.create(miczon_id='QA-1', name='Laptop', super_category=self.it, custodian=self.employee)
        self.chair = Asset.objects.create(miczon_id='QA-2', name='Chair', super_category=self.furniture, custodian=self.employee)
        self.session = HealthCheckSession.objects.create(title='IT QA', super_category=self.it)
        self.client.force_authenticate(self.admin)

    def test_selected_return_leaves_unselected_asset_assigned(self):
        res = self.client.post(f'/api/employees/{self.employee.pk}/unassign-all/', {'asset_ids': [self.asset.pk]}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(res.data['returned_count'], 1)
        self.asset.refresh_from_db(); self.chair.refresh_from_db()
        self.assertIsNone(self.asset.custodian)
        self.assertEqual(self.chair.custodian_id, self.employee.pk)
        self.assertTrue(self.chair.assignments.filter(status='ASSIGNED').exists())

    def test_missing_return_selection_does_not_offboard_everyone(self):
        res = self.client.post(f'/api/employees/{self.employee.pk}/unassign-all/', {}, format='json')
        self.assertEqual(res.status_code, 400)
        self.assertEqual(Asset.objects.filter(custodian=self.employee).count(), 2)

    def test_edit_and_transfer_keep_one_active_assignment(self):
        other = Employee.objects.create(name='Other', employee_id='OTHER')
        res = self.client.patch(f'/api/assets/{self.asset.pk}/', {'custodian': other.pk}, format='json')
        self.assertEqual(res.status_code, 200)
        self.assertEqual(self.asset.assignments.filter(status='ASSIGNED').get().employee_id, other.pk)
        self.assertTrue(self.asset.assignments.filter(employee=self.employee, status='RETURNED').exists())

    def test_inspection_history_and_targets_survive_return(self):
        from .models import HealthCheckResponse
        HealthCheckResponse.objects.create(session=self.session, employee=self.employee, asset=self.asset, performance_rating=2)
        self.asset.custodian = None; self.asset.save()
        res = self.client.get(f'/api/reports/health-compliance/?session={self.session.pk}')
        self.assertEqual(res.data['summary']['target_assets'], 1)
        self.assertEqual(res.data['summary']['completed_assets'], 1)
        self.assertEqual(res.data['summary']['critical_alerts'], 1)
        self.assertEqual(len(res.data['responses']), 1)

    def test_furniture_answers_persist_and_export_scope_matches(self):
        from .models import HealthCheckSession, HealthCheckResponse
        from openpyxl import load_workbook
        from io import BytesIO
        session = HealthCheckSession.objects.create(title='Furniture QA', super_category=self.furniture)
        res = self.client.post('/api/health-responses/bulk-submit/', {'session': session.pk, 'employee': self.employee.pk, 'responses': [
            {'asset': self.chair.pk, 'surface_finish': 'SEVERELY_DAMAGED', 'structural_stability': 'UNSTABLE_REPAIR_NEEDED', 'performance_rating': 1}]}, format='json')
        self.assertEqual(res.status_code, 201, res.data)
        response = HealthCheckResponse.objects.get(session=session)
        self.assertEqual(response.surface_finish, 'SEVERELY_DAMAGED')
        self.assertEqual(response.structural_stability, 'UNSTABLE_REPAIR_NEEDED')
        report = self.client.get(f'/api/reports/export-health-responses/?session={session.pk}&type=all')
        self.assertEqual(report.status_code, 200)
        workbook = load_workbook(BytesIO(report.content), data_only=True)
        summary = dict(list(workbook['Summary'].values)[1:])
        self.assertEqual(summary['Target Assets'], 1)
        self.assertEqual(summary['Completion %'], 100)
        self.assertIn('Inspection Findings', next(workbook['Submitted Inspections'].values))

    def test_manager_compliance_uses_team(self):
        from .models import HealthCheckResponse
        manager = Employee.objects.create(name='Manager', employee_id='MGR', user=self.admin, department=self.dept)
        self.dept.manager = manager; self.dept.save()
        self.admin.is_superuser = False; self.admin.is_staff = False; self.admin.save()
        HealthCheckResponse.objects.create(session=self.session, employee=self.employee, asset=self.asset)
        res = self.client.get(f'/api/reports/health-compliance/?session={self.session.pk}')
        self.assertEqual(res.data['summary']['completed_assets'], 1)

    def test_request_status_cannot_be_patched(self):
        req = AssetActionRequest.objects.create(requester=self.employee, asset=self.asset, action_type='RETURN')
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.patch(f'/api/requests/{req.pk}/', {'status': 'APPROVED'}).status_code, 403)
        req.refresh_from_db(); self.assertEqual(req.status, 'PENDING')

    def test_employee_cannot_close_or_delete_inspection(self):
        self.client.force_authenticate(self.user)
        self.assertEqual(self.client.patch(f'/api/health-checks/{self.session.pk}/', {'status': 'CLOSED'}).status_code, 403)
        self.assertEqual(self.client.delete(f'/api/health-checks/{self.session.pk}/').status_code, 403)

    def test_assignment_cannot_be_deleted(self):
        self.client.force_authenticate(self.user)
        assignment = self.asset.assignments.get(status='ASSIGNED')
        self.assertEqual(self.client.delete(f'/api/assignments/{assignment.pk}/').status_code, 403)

    def test_matching_name_does_not_grant_access(self):
        stranger = User.objects.create_user(username=self.employee.name, email='stranger@example.com')
        self.client.force_authenticate(stranger)
        res = self.client.get('/api/assets/')
        self.assertEqual(res.data['count'], 0)

    def test_import_preserves_super_category_and_assignment(self):
        res = self.client.post('/api/assets/bulk-commit/', {'rows': [{'miczon_id': 'IMPORTED', 'name': 'Imported chair', 'super_category': self.furniture.pk,
            'custodian_id': self.employee.pk, 'category': 'Chair', 'status': 'ASSIGNED'}]}, format='json')
        self.assertEqual(res.status_code, 200, res.data)
        asset = Asset.objects.get(miczon_id='IMPORTED')
        self.assertEqual(asset.super_category_id, self.furniture.pk)
        self.assertTrue(asset.assignments.filter(employee=self.employee, status='ASSIGNED').exists())
