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
