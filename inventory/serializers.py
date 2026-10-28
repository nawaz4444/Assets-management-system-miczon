from rest_framework import serializers
from .models import Asset, Employee, Department, AssetHistory, InspectionLog, SuperCategory

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
        if obj.employee and obj.employee.department:
            return obj.employee.department.name
        if obj.asset and obj.asset.department:
            return obj.asset.department.name
        return "Unassigned"

    def validate_performance_rating(self, value):
        if value < 1 or value > 5:
            raise serializers.ValidationError('Performance rating must be between 1 and 5.')
        return value

class HealthCheckSessionSerializer(serializers.ModelSerializer):
    triggered_by_name = serializers.CharField(source='triggered_by.username', read_only=True)
    super_category_name = serializers.CharField(source='super_category.name', read_only=True)
    super_category_code = serializers.CharField(source='super_category.code', read_only=True)
    response_count = serializers.IntegerField(read_only=True)
    pending_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = HealthCheckSession
        fields = '__all__'


# --- HELP DESK / TICKETS: ROUTING FOUNDATION ---
from .models import AgentGroup, TicketCategory, TicketType, Ticket


class AgentGroupSerializer(serializers.ModelSerializer):
    member_names = serializers.SerializerMethodField()
    member_count = serializers.SerializerMethodField()

    class Meta:
        model = AgentGroup
        fields = ['id', 'name', 'description', 'members', 'member_names', 'member_count', 'is_active', 'created_at']

    def get_member_names(self, obj):
        return [m.name for m in obj.members.all()]

    def get_member_count(self, obj):
        return obj.members.count()


class TicketTypeSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    agent_group_name = serializers.CharField(source='agent_group.name', read_only=True, default=None)
    resolved_agent_group_name = serializers.SerializerMethodField()

    class Meta:
        model = TicketType
        fields = ['id', 'name', 'category', 'category_name', 'agent_group', 'agent_group_name',
                  'resolved_agent_group_name', 'asset_action', 'is_active', 'created_at']

    def get_resolved_agent_group_name(self, obj):
        group = obj.resolved_agent_group
        return group.name if group else None


class TicketCategorySerializer(serializers.ModelSerializer):
    default_agent_group_name = serializers.CharField(source='default_agent_group.name', read_only=True, default=None)
    type_count = serializers.SerializerMethodField()

    class Meta:
        model = TicketCategory
        fields = ['id', 'name', 'description', 'default_agent_group', 'default_agent_group_name',
                  'type_count', 'is_active', 'created_at']

    def get_type_count(self, obj):
        return obj.types.count()


class TicketSerializer(serializers.ModelSerializer):
    category_name = serializers.CharField(source='category.name', read_only=True)
    ticket_type_name = serializers.CharField(source='ticket_type.name', read_only=True)
    priority_display = serializers.CharField(source='get_priority_display', read_only=True)
    status_display = serializers.CharField(source='get_status_display', read_only=True)
    raised_by_name = serializers.CharField(source='raised_by.name', read_only=True)
    raised_for_name = serializers.CharField(source='raised_for.name', read_only=True, default=None)
    assigned_group_name = serializers.CharField(source='assigned_group.name', read_only=True, default=None)
    assigned_agent_name = serializers.CharField(source='assigned_agent.name', read_only=True, default=None)
    attachment_url = serializers.SerializerMethodField()

    class Meta:
        model = Ticket
        fields = [
            'id', 'code', 'title', 'category', 'category_name', 'ticket_type', 'ticket_type_name',
            'priority', 'priority_display', 'description', 'attachment', 'attachment_url',
            'raised_by', 'raised_by_name', 'raised_for', 'raised_for_name',
            'status', 'status_display', 'assigned_group', 'assigned_group_name',
            'assigned_agent', 'assigned_agent_name',
            'action_request', 'action_request_status',
            'created_at', 'updated_at', 'resolved_at', 'closed_at',
        ]
        read_only_fields = [
            'code', 'raised_by', 'status', 'assigned_group', 'assigned_agent',
            'action_request', 'resolved_at', 'closed_at',
        ]

    action_request_status = serializers.CharField(source='action_request.status', read_only=True, default=None)

    def get_attachment_url(self, obj):
        if not obj.attachment:
            return None
        request = self.context.get('request')
        url = obj.attachment.url
        return request.build_absolute_uri(url) if request else url

    def validate(self, data):
        # Type must belong to the chosen category.
        category = data.get('category')
        ticket_type = data.get('ticket_type')
        if category and ticket_type and ticket_type.category_id != category.id:
            raise serializers.ValidationError({'ticket_type': 'This type does not belong to the selected category.'})
        return data
