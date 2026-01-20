from rest_framework import serializers
from .models import Asset, Employee, Department, AssetHistory, InspectionLog









class DepartmentSerializer(serializers.ModelSerializer):
    class Meta:
        model = Department
        fields = '__all__'

class EmployeeSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)
    class Meta:
        model = Employee
        fields = ['id', 'name', 'employee_id', 'email', 'department', 'department_name']

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
    qr_code_url = serializers.SerializerMethodField()
    active_assignment_id = serializers.SerializerMethodField()

    class Meta:
        model = Asset
        fields = [
            'id', 'miczon_id', 'name', 'category', 
            'current_status', 'custodian', 'custodian_name', 
            'department', 'department_name', 'qr_code_url',
            'maintenance_vendor', 'sent_to_repair_date', 'expected_return_date', 'is_overdue_repair',
            'active_assignment_id'
        ]

    def get_active_assignment_id(self, obj):
        # OPTIMIZATION: Use pre-fetched data (python-side filtering)
        for assignment in obj.assignments.all():
            if assignment.status == 'ASSIGNED':
                return assignment.id
        return None

    def get_qr_code_url(self, obj):
        request = self.context.get('request')
        if obj.qr_code and request:
            return request.build_absolute_uri(obj.qr_code.url)
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


