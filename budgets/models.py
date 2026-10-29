from django.db import models
from django.utils import timezone


# ---------------------------------------------------------------------------
# Settings: expense taxonomy, department budgets, roles, approval flows
# ---------------------------------------------------------------------------
class ExpenseCategory(models.Model):
    """Top-level expense grouping, e.g. Admin, IT, Grocery, Cars Maintenance."""
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'Expense categories'

    def __str__(self):
        return self.name


class ExpenseType(models.Model):
    """A specific kind of expense within a category."""
    category = models.ForeignKey(ExpenseCategory, on_delete=models.CASCADE, related_name='types')
    name = models.CharField(max_length=120)
    description = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['category__name', 'name']
        unique_together = [('category', 'name')]

    def __str__(self):
        return f"{self.category.name} / {self.name}"


class BudgetRoleAssignment(models.Model):
    """Maps approval-engine roles (Accounts, CEO, ...) to real employees.
    The Department Manager role is resolved dynamically from
    Department.manager, so it is never stored here."""
    ROLE_CHOICES = [
        ('FINANCE', 'Finance'),
        ('CEO', 'CEO'),
    ]
    role = models.CharField(max_length=20, choices=ROLE_CHOICES)
    employee = models.ForeignKey('inventory.Employee', on_delete=models.CASCADE, related_name='budget_roles')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('role', 'employee')]
        ordering = ['role']

    def __str__(self):
        return f"{self.get_role_display()} — {self.employee.name}"


class DepartmentBudget(models.Model):
    """The allocation ceiling for a department in a fiscal year. Used as a
    soft cap: over-budget requests are flagged but may still be approved."""
    PERIOD_CHOICES = [
        ('MONTHLY', 'Monthly'),
        ('ANNUAL', 'Annual'),
    ]
    department = models.ForeignKey('inventory.Department', on_delete=models.CASCADE, related_name='budgets')
    fiscal_year = models.PositiveIntegerField()
    period_type = models.CharField(max_length=10, choices=PERIOD_CHOICES, default='MONTHLY')
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    custodian = models.ForeignKey(
        'inventory.Employee', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='custodian_budgets',
        help_text='The person who requests advances and logs expenses for this department.',
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('department', 'fiscal_year', 'period_type')]
        ordering = ['-fiscal_year', 'department__name']

    def __str__(self):
        return f"{self.department.name} {self.fiscal_year} ({self.get_period_type_display()})"


class RecurringLine(models.Model):
    """A standing monthly expense a department expects every cycle, e.g.
    Grocery = 10,000/month. The custodian generates advance requests from the
    active lines each month instead of retyping them."""
    department = models.ForeignKey('inventory.Department', on_delete=models.CASCADE, related_name='recurring_lines')
    title = models.CharField(max_length=200)
    expense_type = models.ForeignKey(
        'ExpenseType', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='recurring_lines',
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    note = models.TextField(blank=True, default='')
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['department__name', 'title']

    def __str__(self):
        return f"{self.department.name} · {self.title} ({self.amount})"


class ApprovalFlow(models.Model):
    """A configurable approval route. For a given request, the most specific
    active flow that matches (by department, expense type, min amount) is
    chosen; a flow marked is_default is the fallback."""
    name = models.CharField(max_length=120)
    department = models.ForeignKey(
        'inventory.Department', on_delete=models.CASCADE, null=True, blank=True,
        related_name='approval_flows',
    )
    expense_type = models.ForeignKey(
        ExpenseType, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='approval_flows',
    )
    min_amount = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)
    is_active = models.BooleanField(default=True)
    is_default = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-is_default', 'name']

    def __str__(self):
        return self.name


class ApprovalStep(models.Model):
    """One ordered step within an ApprovalFlow. The approver can be the
    department manager, anyone holding a role, or a specific person."""
    APPROVER_KINDS = [
        ('DEPT_MANAGER', 'Department Manager'),
        ('ROLE', 'Role'),
        ('PERSON', 'Specific Person'),
    ]
    flow = models.ForeignKey(ApprovalFlow, on_delete=models.CASCADE, related_name='steps')
    order = models.PositiveIntegerField(default=1)
    approver_kind = models.CharField(max_length=20, choices=APPROVER_KINDS, default='DEPT_MANAGER')
    role = models.CharField(
        max_length=20, blank=True, default='',
        help_text='When kind is Role, matches BudgetRoleAssignment.role (e.g. ACCOUNTS, CEO).',
    )
    person = models.ForeignKey(
        'inventory.Employee', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='approval_steps',
    )
    label = models.CharField(max_length=120, blank=True, default='')

    class Meta:
        ordering = ['flow', 'order']
        unique_together = [('flow', 'order')]

    def __str__(self):
        return f"{self.flow.name} #{self.order} ({self.get_approver_kind_display()})"


# ---------------------------------------------------------------------------
# Operational: cycles, advance requests, approvals, cheques, expenses, bills
# (schema defined now; driven by the UI in later phases)
# ---------------------------------------------------------------------------
class BudgetCycle(models.Model):
    """One month of spending for one department. Carries the opening balance
    forward from the previous cycle."""
    STATUS_CHOICES = [('OPEN', 'Open'), ('CLOSED', 'Closed')]
    department = models.ForeignKey('inventory.Department', on_delete=models.CASCADE, related_name='budget_cycles')
    custodian = models.ForeignKey(
        'inventory.Employee', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='budget_cycles',
    )
    month = models.PositiveSmallIntegerField()
    year = models.PositiveIntegerField()
    opening_balance = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='OPEN')
    closed_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('department', 'month', 'year')]
        ordering = ['-year', '-month', 'department__name']

    def __str__(self):
        return f"{self.department.name} {self.month}/{self.year}"


class AdvanceRequest(models.Model):
    STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('PENDING_FINANCE', 'Waiting on Finance'),
        ('PENDING_CEO', 'Waiting on CEO'),
        ('APPROVED', 'Approved — funds released'),
        ('REJECTED', 'Rejected'),
        ('CANCELLED', 'Cancelled'),
    ]
    cycle = models.ForeignKey(
        BudgetCycle, on_delete=models.CASCADE, null=True, blank=True,
        related_name='advance_requests',
    )
    department = models.ForeignKey('inventory.Department', on_delete=models.CASCADE, related_name='advance_requests')
    requested_by = models.ForeignKey(
        'inventory.Employee', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='advance_requests',
    )
    expense_type = models.ForeignKey(
        ExpenseType, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='advance_requests',
    )
    flow = models.ForeignKey(
        ApprovalFlow, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='advance_requests',
    )
    source_line = models.ForeignKey(
        RecurringLine, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='requests',
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    reason = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='DRAFT')
    current_step = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Advance #{self.pk} — {self.department} — {self.amount}"


class ApprovalTask(models.Model):
    """A materialised approval step for one AdvanceRequest — the inbox item an
    approver acts on."""
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
        ('SKIPPED', 'Skipped'),
    ]
    request = models.ForeignKey(AdvanceRequest, on_delete=models.CASCADE, related_name='tasks')
    step = models.ForeignKey(ApprovalStep, on_delete=models.SET_NULL, null=True, blank=True, related_name='tasks')
    order = models.PositiveIntegerField(default=1)
    approver = models.ForeignKey(
        'inventory.Employee', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='approval_tasks',
    )
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='PENDING')
    note = models.TextField(blank=True, default='')
    acted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['request', 'order']

    def __str__(self):
        return f"Task {self.order} for Advance #{self.request_id}"


class Cheque(models.Model):
    advance_request = models.OneToOneField(AdvanceRequest, on_delete=models.CASCADE, related_name='cheque')
    cheque_no = models.CharField(max_length=80)
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    bank = models.CharField(max_length=120, blank=True, default='')
    issued_by = models.ForeignKey(
        'inventory.Employee', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='issued_cheques',
    )
    issued_date = models.DateField(default=timezone.now)
    note = models.TextField(blank=True, default='')
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Cheque {self.cheque_no} — {self.amount}"


class Expense(models.Model):
    """A single line of actual spend against a cycle."""
    cycle = models.ForeignKey(BudgetCycle, on_delete=models.CASCADE, related_name='expenses')
    title = models.CharField(max_length=200)
    expense_type = models.ForeignKey(
        ExpenseType, on_delete=models.SET_NULL, null=True, blank=True,
        related_name='expenses',
    )
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    spent_on = models.DateField(default=timezone.now)
    note = models.TextField(blank=True, default='')
    created_by = models.ForeignKey(
        'inventory.Employee', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='expenses',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-spent_on', '-created_at']

    def __str__(self):
        return f"{self.title} — {self.amount}"


def bill_upload_path(instance, filename):
    return f"budget_bills/{instance.expense_id}/{filename}"


class Bill(models.Model):
    """A receipt/proof file attached to an Expense."""
    expense = models.ForeignKey(Expense, on_delete=models.CASCADE, related_name='bills')
    file = models.FileField(upload_to=bill_upload_path)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Bill for Expense #{self.expense_id}"
