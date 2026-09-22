"""Identity and historical inspection scope shared by API workflows."""
import json
from pathlib import Path
from .models import Asset, Employee, HealthCheckResponse

INSPECTION_FIELDS = json.loads(Path(__file__).with_name('inspection_fields.json').read_text())


def employee_for_user(user):
    if not user or not user.is_authenticated:
        return None
    linked = Employee.objects.filter(user=user).first()
    if linked:
        return linked
    # Compatibility for legacy records: never match names or an employee linked
    # to another account, and reject ambiguous email matches on either side.
    if not user.email or type(user).objects.filter(email__iexact=user.email).count() != 1:
        return None
    candidates = Employee.objects.filter(email__iexact=user.email)
    if candidates.count() == 1:
        employee = candidates.first()
        return employee if employee.user_id is None else None
    return None


def snapshot_targets(category_id=None):
    assets = Asset.objects.filter(current_status='ASSIGNED', custodian__isnull=False).select_related('custodian', 'custodian__department', 'department')
    if category_id:
        assets = assets.filter(super_category_id=category_id)
    return [target_row(asset, asset.custodian) for asset in assets]


def target_row(asset, employee):
    return {
        'id': asset.pk, 'employee_id': employee.pk, 'name': asset.name,
        'miczon_id': asset.miczon_id, 'category': asset.category,
        'department_name': employee.department.name if employee.department else (asset.department.name if asset.department else 'Unassigned'),
    }


def session_assets(session):
    rows = session.targets_snapshot
    if rows is None:
        # Legacy sessions lack a snapshot. Preserve all recorded responses.
        rows = snapshot_targets(session.super_category_id)
        by_id = {row['id']: row for row in rows}
        for response in HealthCheckResponse.objects.filter(session=session).select_related('asset', 'employee__department'):
            by_id[response.asset_id] = target_row(response.asset, response.employee)
        rows = list(by_id.values())
    assets = {a.pk: a for a in Asset.objects.filter(pk__in=[r['id'] for r in rows]).select_related('department', 'super_category')}
    employees = {e.pk: e for e in Employee.objects.filter(pk__in=[r['employee_id'] for r in rows]).select_related('department')}
    result = []
    for row in rows:
        asset = assets.get(row['id'])
        employee = employees.get(row['employee_id'])
        if not asset or not employee:
            continue
        # These detached instances are for reporting only; never save them.
        asset.custodian = employee
        asset.name, asset.miczon_id, asset.category = row['name'], row['miczon_id'], row['category']
        asset.inspection_department = row['department_name']
        result.append(asset)
    return result


def inspection_fields(asset, session=None):
    category = (session.super_category if session and session.super_category_id else asset.super_category)
    return INSPECTION_FIELDS.get(category.code if category else 'it_assets', INSPECTION_FIELDS['it_assets'])
