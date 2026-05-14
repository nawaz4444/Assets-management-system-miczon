from rest_framework import serializers
from .models import Asset, Employee, Department, AssetHistory, InspectionLog









class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = '__all__'

class EmployeeSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)
    assigned_assets_count = serializers.IntegerField(read_only=True)
    class Meta:
        model = Employee
        fields = ['id', 'name', 'employee_id', 'email', 'department', 'department_name', 'assigned_assets_count']

class AssetHistorySerializer(serializers.ModelSerializer):
    class Meta:
        model = AssetHistory
        fields = ['action', 'date', 'remarks', 'from_employee', 'to_employee']

class InspectionLogSerializer(serializers.ModelSerializer):
    asset_miczon_id = serializers.CharField(source='asset.miczon_id', read_only=True)
    asset_name = serializers.CharField(source='asset.name', read_only=True)

    class Meta:
        model = InspectionLog
        fields = '__all__'

# --- ASSET SERIALIZERS: List vs Detail Pattern ---

class AssetListSerializer(serializers.ModelSerializer):
    """
    Lightweight serializer for list/table views.
    Only includes essential fields to minimize JSON payload.
    """
    custodian_name = serializers.CharField(source='custodian.name', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    active_assignment_id = serializers.SerializerMethodField()

    class Meta:
        model = Asset
        fields = [
            'id', 'miczon_id', 'name', 'category', 'specifications',
            'current_status', 'custodian', 'custodian_name', 
            'department', 'department_name',
            'maintenance_vendor', 'sent_to_repair_date', 'expected_return_date', 'is_overdue_repair',
            'active_assignment_id'
        ]

    def get_active_assignment_id(self, obj):
        # OPTIMIZATION: Use pre-fetched data (python-side filtering)
        for assignment in obj.assignments.all():
            if assignment.status == 'ASSIGNED':
                return assignment.id
        return None

class AssetDetailSerializer(AssetListSerializer):
    """
    Full serializer for detail/retrieve views.
    Inherits from AssetListSerializer and adds heavy fields.
    """
    history = AssetHistorySerializer(many=True, read_only=True)
    latest_inspection = serializers.SerializerMethodField()
    active_assignment_id = serializers.SerializerMethodField()

    class Meta(AssetListSerializer.Meta):
        fields = AssetListSerializer.Meta.fields + [
            'specifications', 'remarks', 'last_inspection_date', 
            'history', 'latest_inspection', 'active_assignment_id'
        ]

    def get_latest_inspection(self, obj):
        # OPTIMIZATION: Use pre-fetched data (python-side filtering)
        logs = list(obj.inspectionlog_set.all())
        if not logs:
            return None
        logs.sort(key=lambda x: (x.date, x.id), reverse=True)
        return InspectionLogSerializer(logs[0]).data

    def get_active_assignment_id(self, obj):
        # OPTIMIZATION: Use pre-fetched data (python-side filtering)
        for assignment in obj.assignments.all():
            if assignment.status == 'ASSIGNED':
                return assignment.id
        return None


# Backward compatibility alias (deprecated, use AssetDetailSerializer)
AssetSerializer = AssetDetailSerializer

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
        try:
            profile = obj.employee_profile
        except:
            profile = None
            
        if not profile:
            from django.db.models import Q
            from .models import Employee
            
            q = Q(user=obj)
            if obj.email:
                q |= Q(email=obj.email)
            full_name = f"{obj.first_name} {obj.last_name}".strip()
            if full_name:
                q |= Q(name__iexact=full_name)
            elif obj.username:
                q |= Q(name__iexact=obj.username)
                
            profile = Employee.objects.filter(q).first()

        if profile:
            return {
                'id': profile.id,
                'name': profile.name,
                'employee_id': profile.employee_id,
                'department': profile.department_id
            }
        return None
from .models import AssetActionRequest
class AssetActionRequestSerializer(serializers.ModelSerializer):
    asset_miczon_id = serializers.SerializerMethodField()
    asset_name = serializers.SerializerMethodField()
    requester_name = serializers.CharField(source='requester.name', read_only=True)
    target_employee_name = serializers.CharField(source='target_employee.name', read_only=True)
    processed_by_name = serializers.CharField(source='processed_by.username', read_only=True)

    class Meta:
        model = AssetActionRequest
        fields = '__all__'

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
    employee_name = serializers.CharField(source='employee.name', read_only=True)
    asset_name = serializers.CharField(source='asset.name', read_only=True)
    asset_miczon_id = serializers.CharField(source='asset.miczon_id', read_only=True)
    asset_category = serializers.CharField(source='asset.category', read_only=True)
    session_title = serializers.CharField(source='session.title', read_only=True)

    class Meta:
        model = HealthCheckResponse
        fields = '__all__'

    def validate_performance_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError('Performance rating must be between 1 and 5.')
        return value

class HealthCheckSessionSerializer(serializers.ModelSerializer):
    triggered_by_name = serializers.CharField(source='triggered_by.username', read_only=True)
    response_count = serializers.IntegerField(read_only=True)
    pending_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = HealthCheckSession
        fields = '__all__'
