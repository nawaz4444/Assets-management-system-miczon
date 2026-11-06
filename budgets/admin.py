from django.contrib import admin

from .models import (
    ExpenseCategory, ExpenseType, BudgetRoleAssignment, DepartmentBudget,
    ApprovalFlow, ApprovalStep, BudgetCycle, AdvanceRequest, ApprovalTask,
    Cheque, Expense, Bill, RecurringLine, ClaimType, ExpenseClaim, ClaimAction, ClaimBill,
)


class ExpenseTypeInline(admin.TabularInline):
    model = ExpenseType
    extra = 0


class ApprovalStepInline(admin.TabularInline):
    model = ApprovalStep
    extra = 0


@admin.register(ExpenseCategory)
class ExpenseCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active', 'created_at')
    list_filter = ('is_active',)
    search_fields = ('name',)
    inlines = [ExpenseTypeInline]


@admin.register(ExpenseType)
class ExpenseTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'is_active')
    list_filter = ('is_active', 'category')
    search_fields = ('name',)


@admin.register(BudgetRoleAssignment)
class BudgetRoleAssignmentAdmin(admin.ModelAdmin):
    list_display = ('role', 'employee')
    list_filter = ('role',)


@admin.register(DepartmentBudget)
class DepartmentBudgetAdmin(admin.ModelAdmin):
    list_display = ('department', 'fiscal_year', 'period_type', 'amount', 'custodian', 'is_active')
    list_filter = ('fiscal_year', 'period_type', 'is_active')


@admin.register(ApprovalFlow)
class ApprovalFlowAdmin(admin.ModelAdmin):
    list_display = ('name', 'department', 'expense_type', 'min_amount', 'is_default', 'is_active')
    list_filter = ('is_active', 'is_default')
    inlines = [ApprovalStepInline]


@admin.register(BudgetCycle)
class BudgetCycleAdmin(admin.ModelAdmin):
    list_display = ('department', 'month', 'year', 'opening_balance', 'status')
    list_filter = ('status', 'year', 'month')


@admin.register(AdvanceRequest)
class AdvanceRequestAdmin(admin.ModelAdmin):
    list_display = ('id', 'department', 'requested_by', 'amount', 'status', 'current_step', 'created_at')
    list_filter = ('status',)


@admin.register(RecurringLine)
class RecurringLineAdmin(admin.ModelAdmin):
    list_display = ('title', 'department', 'amount', 'is_active')
    list_filter = ('is_active', 'department')


@admin.register(ClaimType)
class ClaimTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active')
    list_filter = ('is_active',)


@admin.register(ExpenseClaim)
class ExpenseClaimAdmin(admin.ModelAdmin):
    list_display = ('id', 'claimant', 'department', 'claim_type', 'kind', 'amount', 'status', 'created_at')
    list_filter = ('status', 'kind')


admin.site.register(ClaimAction)
admin.site.register(ClaimBill)
admin.site.register(ApprovalStep)
admin.site.register(ApprovalTask)
admin.site.register(Cheque)
admin.site.register(Expense)
admin.site.register(Bill)
