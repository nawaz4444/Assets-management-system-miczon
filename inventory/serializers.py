from rest_framework import serializers
from .models import Asset, Employee, Department, AssetHistory, InspectionLog, SuperCategory
from .services import employee_for_user, inspection_fields

class SuperCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = SuperCategory
        fields = '__all__'

class DepartmentSerializer(serializers.ModelSerializer):
    manager_name = serializers.CharField(source='manager.name', read_only=True)
    class Meta:
        model = Department
        fields = '__all__'

class EmployeeSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)
    assigned_assets_count = serializers.IntegerField(read_only=True)
    is_manager = serializers.SerializerMethodField()

    def get_is_manager(self, obj):
        if hasattr(obj, 'is_manager_flag'):
            return obj.is_manager_flag
        return obj.managed_departments.exists()

    class Meta:
        model = Employee
        fields = ['id', 'name', 'employee_id', 'email', 'department', 'department_name', 'assigned_assets_count', 'is_manager']

class AssetHistorySerializer(serializers.ModelSerializer):
    from_employee_name = serializers.CharField(source='from_employee.name', read_only=True)
    to_employee_name = serializers.CharField(source='to_employee.name', read_only=True)

    class Meta:
        model = AssetHistory
        fields = '__all__'

class InspectionLogSerializer(serializers.ModelSerializer):
    asset_miczon_id = serializers.CharField(source='asset.miczon_id', read_only=True)
    asset_name = serializers.CharField(source='asset.name', read_only=True)

    class Meta:
        model = InspectionLog
        fields = '__all__'

# --- ASSET SERIALIZERS: List vs Detail Pattern ---

class AssetListSerializer(serializers.ModelSerializer):
    custodian_name = serializers.CharField(source='custodian.name', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    super_category_name = serializers.CharField(source='super_category.name', read_only=True)
    super_category_code = serializers.CharField(source='super_category.code', read_only=True)

    class Meta:
        model = Asset
        fields = ['id', 'miczon_id', 'name', 'super_category', 'super_category_name', 'super_category_code', 'category', 'specifications', 'current_status', 'custodian', 'custodian_name', 'department', 'department_name']

class AssetDetailSerializer(serializers.ModelSerializer):
    """
    Full detail serializer for Single Asset View / Drawer.
    Includes nested relations, history, and status properties.
    """
    custodian_name = serializers.CharField(source='custodian.name', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    super_category_name = serializers.CharField(source='super_category.name', read_only=True)
    super_category_code = serializers.CharField(source='super_category.code', read_only=True)
    history = AssetHistorySerializer(many=True, read_only=True)
    latest_inspection = serializers.SerializerMethodField()
    last_inspection_date = serializers.SerializerMethodField()
    is_overdue_repair = serializers.ReadOnlyField()

    class Meta:
        model = Asset
        fields = '__all__'

    def get_latest_inspection(self, obj):
        latest = HealthCheckResponse.objects.filter(asset=obj).order_by('-submitted_at').first()
        if latest:
            return HealthCheckResponseSerializer(latest).data
        return None

    def get_last_inspection_date(self, obj):
        if obj.last_inspection_date:
            return obj.last_inspection_date
        latest = HealthCheckResponse.objects.filter(asset=obj).order_by('-submitted_at').first()
        if latest and latest.submitted_at:
            return latest.submitted_at.date()
        return None

class AssetSerializer(serializers.ModelSerializer):
    custodian_name = serializers.CharField(source='custodian.name', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    super_category_name = serializers.CharField(source='super_category.name', read_only=True)
    super_category_code = serializers.CharField(source='super_category.code', read_only=True)

    class Meta:
        model = Asset
        fields = '__all__'

from .models import AssetAssignment
class AssetAssignmentSerializer(serializers.ModelSerializer):
    asset_name = serializers.CharField(source='asset.name', read_only=True)
    miczon_id = serializers.CharField(source='asset.miczon_id', read_only=True)
    employee_name = serializers.CharField(source='employee.name', read_only=True)

    class Meta:
        model = AssetAssignment
        fields = '__all__'

from django.contrib.auth.models import User

class UserSerializer(serializers.ModelSerializer):
    permissions = serializers.SerializerMethodField()
    employee_details = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ['id', 'email', 'is_superuser', 'permissions', 'employee_details']

    def get_permissions(self, obj):
        return list(obj.get_all_permissions())

    def get_employee_details(self, obj):
        profile = employee_for_user(obj)

        if profile:
            managed_depts = list(profile.managed_departments.values('id', 'name'))
            is_manager = len(managed_depts) > 0
            role = 'ADMIN' if obj.is_superuser else ('MANAGER' if is_manager else 'EMPLOYEE')
            return {
                'id': profile.id,
                'name': profile.name,
                'employee_id': profile.employee_id,
                'department': profile.department_id,
                'is_manager': is_manager,
                'managed_departments': managed_depts,
                'role': role
            }
        return None
from .models import AssetActionRequest
class AssetActionRequestSerializer(serializers.ModelSerializer):
    asset_miczon_id = serializers.SerializerMethodField()
    asset_name = serializers.SerializerMethodField()
    requester_name = serializers.CharField(source='requester.name', read_only=True)
    target_employee_name = serializers.CharField(source='target_employee.name', read_only=True)
    processed_by_name = serializers.CharField(source='processed_by.username', read_only=True)
    submitted_by_name = serializers.CharField(source='submitted_by.username', read_only=True)

    def validate(self, attrs):
        attrs = super().validate(attrs)
        request = self.context.get('request')
        if request and not request.user.is_superuser:
            employee = employee_for_user(request.user)
            departments = list(employee.managed_departments.values_list('id', flat=True)) if employee else []
            team = set(Employee.objects.filter(department_id__in=departments).values_list('id', flat=True))
            if employee:
                team.add(employee.pk)
            requester = attrs.get('requester', getattr(self.instance, 'requester', None))
            if not requester or requester.pk not in team:
                raise serializers.ValidationError({'requester': 'Choose yourself or an employee in your team.'})
            target = attrs.get('target_employee', getattr(self.instance, 'target_employee', None))
            if target and target.pk not in team:
                raise serializers.ValidationError({'target_employee': 'Choose an employee in your team.'})
            asset = attrs.get('asset', getattr(self.instance, 'asset', None))
            if asset and asset.custodian_id not in team and asset.department_id not in departments:
                raise serializers.ValidationError({'asset': 'This asset is outside your team.'})
        return attrs

    class Meta:
        model = AssetActionRequest
        fields = '__all__'
        read_only_fields = ['status', 'admin_remarks', 'processed_at', 'processed_by', 'submitted_by']

    def get_asset_miczon_id(self, obj):
        if obj.asset:
            return obj.asset.miczon_id
        if obj.asset_data and 'miczon_id' in obj.asset_data:
            return obj.asset_data['miczon_id']
        return None

    def get_asset_name(self, obj):
        if obj.asset:
            return obj.asset.name
        if obj.asset_data and 'name' in obj.asset_data:
            return obj.asset_data['name']
        return None

from .models import HealthCheckSession, HealthCheckResponse

class HealthCheckResponseSerializer(serializers.ModelSerializer):
    inspection_findings = serializers.SerializerMethodField()
    super_category_code = serializers.CharField(source='asset.super_category.code', read_only=True)
    employee_name = serializers.CharField(source='employee.name', read_only=True)
    employee_code = serializers.CharField(source='employee.employee_id', read_only=True, default='')
    email = serializers.CharField(source='employee.email', read_only=True, default='')
    department = serializers.SerializerMethodField()
    asset_name = serializers.CharField(source='asset.name', read_only=True)
    asset_miczon_id = serializers.CharField(source='asset.miczon_id', read_only=True)
    asset_category = serializers.CharField(source='asset.category', read_only=True)
    session_title = serializers.CharField(source='session.title', read_only=True)

    class Meta:
        model = HealthCheckResponse
        fields = '__all__'

    def get_department(self, obj):
        if hasattr(obj.asset, 'inspection_department'):
            return obj.asset.inspection_department
        if obj.employee and obj.employee.department:
            return obj.employee.department.name
        if obj.asset and obj.asset.department:
            return obj.asset.department.name
        return "Unassigned"

    def get_inspection_findings(self, obj):
        return [{'label': field['label'], 'value': field['options'].get(getattr(obj, field['name']), getattr(obj, field['name']) or 'Not recorded')}
                for field in inspection_fields(obj.asset, obj.session)]

    def validate_performance_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError('Performance rating must be between 1 and 5.')
        return value

    def validate(self, attrs):
        attrs = super().validate(attrs)
        asset = attrs.get('asset') or getattr(self.instance, 'asset', None)
        session = attrs.get('session') or getattr(self.instance, 'session', None)
        if asset and session and session.super_category_id and asset.super_category_id != session.super_category_id:
            raise serializers.ValidationError({'asset': 'This asset is outside the inspection category.'})
        if asset:
            for field in inspection_fields(asset, session):
                value = attrs.get(field['name'])
                if value is not None and value not in field['options']:
                    raise serializers.ValidationError({field['name']: 'Select a valid condition.'})
        return attrs

class HealthCheckSessionSerializer(serializers.ModelSerializer):
    triggered_by_name = serializers.CharField(source='triggered_by.username', read_only=True)
    super_category_name = serializers.CharField(source='super_category.name', read_only=True)
    super_category_code = serializers.CharField(source='super_category.code', read_only=True)
    response_count = serializers.IntegerField(read_only=True)
    pending_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = HealthCheckSession
        exclude = ['targets_snapshot']
        read_only_fields = ['status', 'triggered_by', 'created_at', 'closed_at']
