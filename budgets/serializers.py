from rest_framework import serializers

from .models import (
    BudgetRoleAssignment, DepartmentBudget, BudgetCycle, AdvanceRequest,
    ApprovalTask, Expense, Bill, ClaimType, ExpenseClaim, ClaimAction, ClaimBill,
    ApprovalPipeline, ApprovalStage, ApprovalRole,
)
from . import services


class ApprovalRoleSerializer(serializers.ModelSerializer):
    class Meta:
        model = ApprovalRole
        fields = ['id', 'name', 'is_active', 'created_at']


class BudgetRoleAssignmentSerializer(serializers.ModelSerializer):
    role_label = serializers.CharField(source='role.name', read_only=True)
    employee_name = serializers.CharField(source='employee.name', read_only=True)

    class Meta:
        model = BudgetRoleAssignment
        fields = ['id', 'role', 'role_label', 'employee', 'employee_name', 'created_at']


class DepartmentBudgetSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)
    custodian_name = serializers.CharField(source='custodian.name', read_only=True)
    pipeline_name = serializers.CharField(source='pipeline.name', read_only=True, default=None)

    class Meta:
        model = DepartmentBudget
        fields = [
            'id', 'department', 'department_name', 'name', 'fiscal_year',
            'amount', 'custodian', 'custodian_name', 'pipeline', 'pipeline_name',
            'is_active', 'created_at', 'updated_at',
        ]


class ApprovalTaskSerializer(serializers.ModelSerializer):
    approver_name = serializers.CharField(source='approver.name', read_only=True)
    stage = serializers.SerializerMethodField()

    class Meta:
        model = ApprovalTask
        fields = ['id', 'order', 'stage', 'approver_name', 'status', 'note', 'acted_at']

    def get_stage(self, obj):
        return obj.stage_label or 'Approver'


class AdvanceRequestSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)
    budget_name = serializers.CharField(source='budget.name', read_only=True)
    requested_by_name = serializers.CharField(source='requested_by.name', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    next_with = serializers.SerializerMethodField()
    history = ApprovalTaskSerializer(source='tasks', many=True, read_only=True)

    class Meta:
        model = AdvanceRequest
        fields = [
            'id', 'budget', 'budget_name', 'department', 'department_name',
            'requested_by', 'requested_by_name',
            'amount', 'reason', 'status', 'status_label', 'next_with', 'history',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['status', 'requested_by']

    def get_next_with(self, obj):
        return services.current_budget_stage_label(obj)


class BillSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = Bill
        fields = ['id', 'file', 'file_url', 'uploaded_at']
        read_only_fields = ['uploaded_at']

    def get_file_url(self, obj):
        if not obj.file:
            return ''
        request = self.context.get('request')
        url = obj.file.url
        return request.build_absolute_uri(url) if request else url


class ExpenseSerializer(serializers.ModelSerializer):
    created_by_name = serializers.CharField(source='created_by.name', read_only=True)
    bills = BillSerializer(many=True, read_only=True)

    class Meta:
        model = Expense
        fields = [
            'id', 'cycle', 'title', 'amount', 'spent_on', 'note',
            'created_by', 'created_by_name', 'bills', 'created_at',
        ]
        read_only_fields = ['created_by']


class BudgetCycleSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)
    custodian_name = serializers.CharField(source='custodian.name', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)

    class Meta:
        model = BudgetCycle
        fields = [
            'id', 'department', 'department_name', 'custodian', 'custodian_name',
            'month', 'year', 'opening_balance', 'status', 'status_label', 'closed_at', 'created_at',
        ]


# ---------------------------------------------------------------------------
# Expense claims
# ---------------------------------------------------------------------------
class ClaimTypeSerializer(serializers.ModelSerializer):
    allowed_claimant_names = serializers.SerializerMethodField()
    pipeline_name = serializers.CharField(source='pipeline.name', read_only=True, default=None)

    class Meta:
        model = ClaimType
        fields = ['id', 'name', 'is_active', 'allowed_claimants', 'allowed_claimant_names',
                  'pipeline', 'pipeline_name', 'created_at']

    def get_allowed_claimant_names(self, obj):
        return [e.name for e in obj.allowed_claimants.all()]


class ClaimActionSerializer(serializers.ModelSerializer):
    approver_name = serializers.CharField(source='approver.name', read_only=True)

    class Meta:
        model = ClaimAction
        fields = ['id', 'stage', 'approver_name', 'status', 'note', 'acted_at']


class ClaimBillSerializer(serializers.ModelSerializer):
    file_url = serializers.SerializerMethodField()

    class Meta:
        model = ClaimBill
        fields = ['id', 'file', 'file_url', 'uploaded_at']
        read_only_fields = ['uploaded_at']

    def get_file_url(self, obj):
        if not obj.file:
            return ''
        request = self.context.get('request')
        url = obj.file.url
        return request.build_absolute_uri(url) if request else url


class ExpenseClaimSerializer(serializers.ModelSerializer):
    claimant_name = serializers.CharField(source='claimant.name', read_only=True)
    department_name = serializers.CharField(source='department.name', read_only=True)
    claim_type_name = serializers.CharField(source='claim_type.name', read_only=True)
    kind_label = serializers.CharField(source='get_kind_display', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    next_with = serializers.SerializerMethodField()
    history = ClaimActionSerializer(source='actions', many=True, read_only=True)
    bills = ClaimBillSerializer(many=True, read_only=True)

    class Meta:
        model = ExpenseClaim
        fields = [
            'id', 'claimant', 'claimant_name', 'department', 'department_name',
            'claim_type', 'claim_type_name', 'kind', 'kind_label', 'amount', 'reason',
            'status', 'status_label', 'next_with', 'history', 'bills',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['status', 'claimant', 'department']

    def get_next_with(self, obj):
        return services.current_claim_stage_label(obj)


# ---------------------------------------------------------------------------
# Approval pipelines (setup)
# ---------------------------------------------------------------------------
class ApprovalStageSerializer(serializers.ModelSerializer):
    role_name = serializers.CharField(source='role.name', read_only=True, default=None)
    approver_kind_label = serializers.CharField(source='get_approver_kind_display', read_only=True)
    people_names = serializers.SerializerMethodField()

    class Meta:
        model = ApprovalStage
        fields = [
            'id', 'order', 'approver_kind', 'approver_kind_label',
            'role', 'role_name', 'people', 'people_names', 'label', 'amount_min',
        ]

    def get_people_names(self, obj):
        return [e.name for e in obj.people.all()]


class ApprovalPipelineSerializer(serializers.ModelSerializer):
    stages = ApprovalStageSerializer(many=True, read_only=True)
    usage_count = serializers.SerializerMethodField()

    class Meta:
        model = ApprovalPipeline
        fields = ['id', 'name', 'is_active', 'stages', 'usage_count']

    def get_usage_count(self, obj):
        return obj.budget_categories.count() + obj.claim_types.count()
