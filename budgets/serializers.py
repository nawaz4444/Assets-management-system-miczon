from rest_framework import serializers

from .models import (
    BudgetRoleAssignment, DepartmentBudget, BudgetCycle, AdvanceRequest,
    ApprovalTask, Expense, Bill,
)


class BudgetRoleAssignmentSerializer(serializers.ModelSerializer):
    role_label = serializers.CharField(source='get_role_display', read_only=True)
    employee_name = serializers.CharField(source='employee.name', read_only=True)

    class Meta:
        model = BudgetRoleAssignment
        fields = ['id', 'role', 'role_label', 'employee', 'employee_name', 'created_at']


class DepartmentBudgetSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)
    custodian_name = serializers.CharField(source='custodian.name', read_only=True)

    class Meta:
        model = DepartmentBudget
        fields = [
            'id', 'department', 'department_name', 'fiscal_year',
            'amount', 'custodian', 'custodian_name', 'is_active',
            'created_at', 'updated_at',
        ]


class ApprovalTaskSerializer(serializers.ModelSerializer):
    approver_name = serializers.CharField(source='approver.name', read_only=True)
    stage = serializers.SerializerMethodField()

    class Meta:
        model = ApprovalTask
        fields = ['id', 'order', 'stage', 'approver_name', 'status', 'note', 'acted_at']

    def get_stage(self, obj):
        return 'Finance' if obj.order == 1 else 'CEO'


class AdvanceRequestSerializer(serializers.ModelSerializer):
    department_name = serializers.CharField(source='department.name', read_only=True)
    requested_by_name = serializers.CharField(source='requested_by.name', read_only=True)
    status_label = serializers.CharField(source='get_status_display', read_only=True)
    next_with = serializers.SerializerMethodField()
    history = ApprovalTaskSerializer(source='tasks', many=True, read_only=True)

    class Meta:
        model = AdvanceRequest
        fields = [
            'id', 'department', 'department_name', 'requested_by', 'requested_by_name',
            'amount', 'reason', 'status', 'status_label', 'next_with', 'history',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['status', 'requested_by']

    def get_next_with(self, obj):
        return {'PENDING_FINANCE': 'Finance', 'PENDING_CEO': 'CEO'}.get(obj.status)


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
