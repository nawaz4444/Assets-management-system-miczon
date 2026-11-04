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
    """Maps an approval role (a user-defined ApprovalRole, e.g. Finance, CEO,
    Director) to a real employee. The Department Manager approver is resolved
    dynamically from Department.manager, so it is never stored here."""
    role = models.ForeignKey('ApprovalRole', on_delete=models.CASCADE, related_name='assignments')
    employee = models.ForeignKey('inventory.Employee', on_delete=models.CASCADE, related_name='budget_roles')
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = [('role', 'employee')]
        ordering = ['role__name']

    def __str__(self):
        return f"{self.role.name} — {self.employee.name}"


class DepartmentBudget(models.Model):
    """The allocation ceiling for a department in a fiscal year. Used as a
    soft cap: over-budget requests are flagged but may still be approved."""
    PERIOD_CHOICES = [
        ('MONTHLY', 'Monthly'),
        ('ANNUAL', 'Annual'),
    ]
    department = models.ForeignKey('inventory.Department', on_delete=models.CASCADE, related_name='budgets')
    name = models.CharField(max_length=120, default='General', help_text='Budget category, e.g. IT Inventory, IT Assets.')
    fiscal_year = models.PositiveIntegerField()
    period_type = models.CharField(max_length=10, choices=PERIOD_CHOICES, default='MONTHLY')
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    custodian = models.ForeignKey(
        'inventory.Employee', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='custodian_budgets',
        help_text='The person who requests advances and logs expenses for this budget.',
    )
    pipeline = models.ForeignKey(
        'ApprovalPipeline', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='budget_categories',
        help_text='The approval chain a budget request for this category walks through.',
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [('department', 'fiscal_year', 'name')]
        ordering = ['-fiscal_year', 'department__name', 'name']

    def __str__(self):
        return f"{self.department.name} · {self.name} ({self.fiscal_year})"


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
    budget = models.ForeignKey('DepartmentBudget', on_delete=models.CASCADE, null=True, blank=True, related_name='cycles')
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
        unique_together = [('budget', 'month', 'year')]
        ordering = ['-year', '-month', 'department__name']

    def __str__(self):
        return f"{self.department.name} {self.month}/{self.year}"


class AdvanceRequest(models.Model):
    STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('PENDING', 'Pending approval'),
        ('PENDING_FINANCE', 'Waiting on Finance'),   # legacy, pre-pipeline
        ('PENDING_CEO', 'Waiting on CEO'),           # legacy, pre-pipeline
        ('APPROVED', 'Approved — funds released'),
        ('REJECTED', 'Rejected'),
        ('CANCELLED', 'Cancelled'),
    ]
    cycle = models.ForeignKey(
        BudgetCycle, on_delete=models.CASCADE, null=True, blank=True,
        related_name='advance_requests',
    )
    budget = models.ForeignKey('DepartmentBudget', on_delete=models.SET_NULL, null=True, blank=True, related_name='advance_requests')
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
    stage_label = models.CharField(max_length=120, blank=True, default='')
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


# ---------------------------------------------------------------------------
# Employee expense claims — Manager → Finance → CEO (separate from budgets)
# ---------------------------------------------------------------------------
class ClaimType(models.Model):
    """A kind of employee expense claim, e.g. Car maintenance, Rent, Tour.
    Only the employees in allowed_claimants may apply for this type."""
    name = models.CharField(max_length=120, unique=True)
    allowed_claimants = models.ManyToManyField('inventory.Employee', blank=True, related_name='claimable_types')
    pipeline = models.ForeignKey(
        'ApprovalPipeline', on_delete=models.SET_NULL, null=True, blank=True,
        related_name='claim_types',
        help_text='The approval chain a claim of this type walks through.',
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class ExpenseClaim(models.Model):
    KIND_CHOICES = [
        ('REIMBURSEMENT', 'Reimbursement'),
        ('ADVANCE', 'Advance'),
    ]
    STATUS_CHOICES = [
        ('PENDING', 'Pending approval'),
        ('PENDING_MANAGER', 'Waiting on Manager'),   # legacy, pre-pipeline
        ('PENDING_FINANCE', 'Waiting on Finance'),   # legacy, pre-pipeline
        ('PENDING_CEO', 'Waiting on CEO'),           # legacy, pre-pipeline
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
        ('CANCELLED', 'Cancelled'),
    ]
    claimant = models.ForeignKey('inventory.Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='expense_claims')
    department = models.ForeignKey('inventory.Department', on_delete=models.SET_NULL, null=True, blank=True, related_name='expense_claims')
    claim_type = models.ForeignKey(ClaimType, on_delete=models.SET_NULL, null=True, blank=True, related_name='claims')
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default='REIMBURSEMENT')
    amount = models.DecimalField(max_digits=14, decimal_places=2, default=0)
    reason = models.TextField(blank=True, default='')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    current_step = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Claim #{self.pk} — {self.claimant} — {self.amount}"


class ClaimAction(models.Model):
    """One approval step taken on a claim — the history trail."""
    STATUS_CHOICES = [('APPROVED', 'Approved'), ('REJECTED', 'Rejected')]
    claim = models.ForeignKey(ExpenseClaim, on_delete=models.CASCADE, related_name='actions')
    stage = models.CharField(max_length=20)  # MANAGER / FINANCE / CEO
    approver = models.ForeignKey('inventory.Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='claim_actions')
    status = models.CharField(max_length=10, choices=STATUS_CHOICES)
    note = models.TextField(blank=True, default='')
    acted_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['claim', 'id']

    def __str__(self):
        return f"{self.stage} {self.status} on claim #{self.claim_id}"


def claim_bill_path(instance, filename):
    return f"claim_bills/{instance.claim_id}/{filename}"


class ClaimBill(models.Model):
    """A receipt/proof file attached to an expense claim."""
    claim = models.ForeignKey(ExpenseClaim, on_delete=models.CASCADE, related_name='bills')
    file = models.FileField(upload_to=claim_bill_path)
    uploaded_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Bill for Claim #{self.claim_id}"


# ---------------------------------------------------------------------------
# Approval roles — user-defined (Finance, CEO, Director, …). Employees are
# mapped to a role via BudgetRoleAssignment; a pipeline stage can target a role.
# ---------------------------------------------------------------------------
class ApprovalRole(models.Model):
    name = models.CharField(max_length=80, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


# ---------------------------------------------------------------------------
# Configurable approval pipelines — a named, reusable ordered list of stages.
# One pipeline can be attached to any number of budget categories and claim
# types (DepartmentBudget.pipeline / ClaimType.pipeline).
# ---------------------------------------------------------------------------
class ApprovalPipeline(models.Model):
    name = models.CharField(max_length=120, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class ApprovalStage(models.Model):
    """One step in a pipeline. Any one person who qualifies approves it to
    advance. amount_min is reserved for a future 'applies when amount ≥ X' rule."""
    KIND_CHOICES = [
        ('ROLE', 'Role'),
        ('PERSON', 'Specific people'),
        ('DEPT_MANAGER', 'Department Manager'),
    ]
    pipeline = models.ForeignKey(ApprovalPipeline, on_delete=models.CASCADE, related_name='stages')
    order = models.PositiveIntegerField(default=1)
    approver_kind = models.CharField(max_length=15, choices=KIND_CHOICES, default='ROLE')
    role = models.ForeignKey(
        'ApprovalRole', on_delete=models.SET_NULL, null=True, blank=True, related_name='stages')
    people = models.ManyToManyField('inventory.Employee', blank=True, related_name='approval_stages')
    label = models.CharField(max_length=120, blank=True, default='')
    amount_min = models.DecimalField(max_digits=14, decimal_places=2, null=True, blank=True)

    class Meta:
        ordering = ['pipeline', 'order']

    def __str__(self):
        return f"{self.pipeline} #{self.order} ({self.get_approver_kind_display()})"
