"""Budget engine — intentionally simple. Every advance request follows a fixed
path: the requester submits, Finance approves, then the CEO approves and the
funds are released (no cheque step). Balance = opening + approved − spent, and
a closed month carries its remainder forward."""
from decimal import Decimal

from django.db.models import Sum
from django.utils import timezone

from inventory.models import Employee
from .models import (
    AdvanceRequest, ApprovalTask, BudgetCycle, BudgetRoleAssignment,
    DepartmentBudget, Expense, ExpenseClaim, ClaimAction, ClaimType,
    ApprovalPipeline, ApprovalStage,
)
from .notifications import queue_emails, valid_emails

ZERO = Decimal('0')


class PipelineNotConfigured(Exception):
    """Raised when a budget category or claim type has no (non-empty) approval
    pipeline attached, so there is no one to route the request to."""


# ---------------------------------------------------------------------------
# Roles — user-defined (Finance, CEO, Director, …), mapped to employees.
# ---------------------------------------------------------------------------
def employees_with_role(role):
    """Employees holding a role, by ApprovalRole id or instance."""
    role_id = getattr(role, 'id', role)
    ids = BudgetRoleAssignment.objects.filter(role_id=role_id).values_list('employee_id', flat=True)
    return list(Employee.objects.filter(id__in=ids))


def role_ids_for_employee(employee):
    if not employee:
        return set()
    return set(BudgetRoleAssignment.objects.filter(employee=employee).values_list('role_id', flat=True))


def has_any_role(employee):
    """Does this employee hold any approval role? Used as the 'elevated'
    (Finance/CEO-style) gate for the dashboard and history now that roles are
    no longer the fixed FINANCE/CEO pair."""
    if not employee:
        return False
    return BudgetRoleAssignment.objects.filter(employee=employee).exists()


# ---------------------------------------------------------------------------
# Approval pipelines — a named, reusable ordered list of stages, attached to a
# budget category (DepartmentBudget.pipeline) or a claim type
# (ClaimType.pipeline). Each stage is a role, specific people, or the
# department manager; any one qualifying person advances it.
# ---------------------------------------------------------------------------
def pipeline_for_budget(req):
    budget = req.budget
    return budget.pipeline if (budget and budget.pipeline and budget.pipeline.is_active) else None


def pipeline_for_claim(claim):
    ct = claim.claim_type
    return ct.pipeline if (ct and ct.pipeline and ct.pipeline.is_active) else None


def pipeline_stages(pipeline):
    if not pipeline:
        return []
    return list(pipeline.stages.select_related('role').prefetch_related('people').order_by('order'))


def stage_label(stage):
    if stage.label:
        return stage.label
    if stage.approver_kind == 'ROLE':
        return stage.role.name if stage.role else 'Approver'
    if stage.approver_kind == 'DEPT_MANAGER':
        return 'Department Manager'
    return 'Approver'


def stage_approvers(stage, department=None):
    if stage.approver_kind == 'ROLE':
        return employees_with_role(stage.role_id) if stage.role_id else []
    if stage.approver_kind == 'DEPT_MANAGER':
        mgr = department.manager if department else None
        return [mgr] if mgr else []
    return list(stage.people.all())


def _eligible(stage, department, exclude_id):
    """Approvers for a stage, minus the requester (no self-approval)."""
    return [e for e in stage_approvers(stage, department) if e and e.id != exclude_id]


def _walk(stages, from_step, department, exclude_id):
    """From `from_step` (1-based), find the next stage that has a real approver,
    skipping empty / self-only stages. Returns the step number, or None when the
    pipeline is exhausted (→ fully approved)."""
    step = from_step
    while step <= len(stages):
        if _eligible(stages[step - 1], department, exclude_id):
            return step
        step += 1
    return None


# ---------------------------------------------------------------------------
# Budget requests
# ---------------------------------------------------------------------------
def submit_request(req):
    stages = pipeline_stages(pipeline_for_budget(req))
    if not stages:
        raise PipelineNotConfigured(
            'This budget category has no approval pipeline attached. '
            'Ask an admin to attach one in Setup → Department budgets.')
    step = _walk(stages, 1, req.department, req.requested_by_id)
    if step is None:
        req.status = 'APPROVED'
        req.current_step = 0
        req.save(update_fields=['status', 'current_step'])
        notify_requester(req, 'approved')
        return req
    req.status = 'PENDING'
    req.current_step = step
    req.save(update_fields=['status', 'current_step'])
    notify_budget_stage(req)
    return req


def _current_budget_stage(req):
    stages = pipeline_stages(pipeline_for_budget(req))
    if req.status == 'PENDING' and 1 <= req.current_step <= len(stages):
        return stages[req.current_step - 1]
    return None


def current_budget_stage_label(req):
    stage = _current_budget_stage(req)
    return stage_label(stage) if stage else None


def can_act(req, employee):
    if not employee or req.status != 'PENDING':
        return False
    stage = _current_budget_stage(req)
    if not stage:
        return False
    return any(e and e.id == employee.id for e in stage_approvers(stage, req.department))


def act_on_request(req, employee, approve, note=''):
    """Approve or reject at the current stage. Returns (req, outcome) where
    outcome is 'advanced', 'approved' or 'rejected'."""
    if not can_act(req, employee):
        raise PermissionError('You are not an approver for this request at its current stage.')

    stage = _current_budget_stage(req)
    ApprovalTask.objects.create(
        request=req, order=req.current_step, approver=employee,
        status='APPROVED' if approve else 'REJECTED', note=note or '',
        stage_label=stage_label(stage), acted_at=timezone.now(),
    )

    if not approve:
        req.status = 'REJECTED'
        req.save(update_fields=['status'])
        notify_requester(req, 'rejected', note)
        return req, 'rejected'

    stages = pipeline_stages(pipeline_for_budget(req))
    nxt = _walk(stages, req.current_step + 1, req.department, req.requested_by_id)
    if nxt is None:
        req.status = 'APPROVED'
        req.current_step = 0
        req.save(update_fields=['status', 'current_step'])
        notify_requester(req, 'approved')
        return req, 'approved'

    req.current_step = nxt
    req.save(update_fields=['current_step'])
    notify_budget_stage(req)
    return req, 'advanced'


# ---------------------------------------------------------------------------
# Cycles & balance
# ---------------------------------------------------------------------------
def get_or_create_cycle_by_id(department_id, when=None, custodian=None):
    from inventory.models import Department
    return get_or_create_cycle(Department.objects.get(pk=department_id), when=when, custodian=custodian)


def previous_available(budget, when):
    """Remaining balance of the month before `when` for this budget line."""
    pm, py = when.month - 1, when.year
    if pm < 1:
        pm, py = 12, when.year - 1
    prev = BudgetCycle.objects.filter(budget=budget, month=pm, year=py).first()
    return cycle_balance(prev)['available'] if prev else ZERO


def current_cycle(budget, custodian=None):
    """The budget line's active (OPEN) period. If none is open, open the next
    one, carrying the latest period's remaining balance forward. 'This month'
    follows Close Month, not the wall calendar, so closing moves the custodian
    into the next period."""
    custodian = custodian or budget.custodian
    cycle = BudgetCycle.objects.filter(budget=budget, status='OPEN').order_by('-year', '-month').first()
    if cycle is None:
        latest = BudgetCycle.objects.filter(budget=budget).order_by('-year', '-month').first()
        if latest:
            nm, ny = latest.month + 1, latest.year
            if nm > 12:
                nm, ny = 1, latest.year + 1
            opening = cycle_balance(latest)['available']
        else:
            today = timezone.localdate()
            nm, ny, opening = today.month, today.year, ZERO
        cycle = BudgetCycle.objects.create(
            budget=budget, department=budget.department, month=nm, year=ny,
            custodian=custodian, opening_balance=opening,
        )
    if custodian and not cycle.custodian:
        cycle.custodian = custodian
        cycle.save(update_fields=['custodian'])
    return cycle


def current_cycle_by_budget_id(budget_id, custodian=None):
    budget = DepartmentBudget.objects.get(pk=budget_id)
    return current_cycle(budget, custodian=custodian)


def set_cycle_opening(cycle, amount):
    cycle.opening_balance = amount
    cycle.save(update_fields=['opening_balance'])
    return cycle


def cycle_balance(cycle):
    opening = cycle.opening_balance or ZERO
    received = AdvanceRequest.objects.filter(cycle=cycle, status='APPROVED').aggregate(s=Sum('amount'))['s'] or ZERO
    spent = Expense.objects.filter(cycle=cycle).aggregate(s=Sum('amount'))['s'] or ZERO
    return {
        'opening_balance': opening,
        'received': received,
        'spent': spent,
        'available': opening + received - spent,
    }


def close_cycle(cycle):
    bal = cycle_balance(cycle)
    if cycle.status != 'CLOSED':
        cycle.status = 'CLOSED'
        cycle.closed_at = timezone.now()
        cycle.save(update_fields=['status', 'closed_at'])

    nm, ny = cycle.month + 1, cycle.year
    if nm > 12:
        nm, ny = 1, cycle.year + 1
    nxt, created = BudgetCycle.objects.get_or_create(
        budget=cycle.budget, month=nm, year=ny,
        defaults={'department': cycle.department, 'custodian': cycle.custodian, 'opening_balance': bal['available']},
    )
    if not created:
        nxt.opening_balance = bal['available']
        nxt.save(update_fields=['opening_balance'])
    return nxt


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------
def _lines(req):
    return (
        f"Ticket No:  #{req.id}\n"
        f"Department: {req.department.name if req.department else '—'}\n"
        f"Budget:     {req.budget.name if req.budget else '—'}\n"
        f"Amount:     Rs {req.amount}\n"
        f"Reason:     {req.reason or '—'}\n"
    )


def notify_budget_stage(req):
    stage = _current_budget_stage(req)
    if not stage:
        return 0
    recipients = valid_emails(stage_approvers(stage, req.department))
    label = stage_label(stage)
    subject = f"Budget request (Ticket #{req.id}) needs {label} approval"
    body = f"A budget request is waiting for your approval ({label}).\n\n" + _lines(req) + "\nReview it in Budgets → Approvals."
    return queue_emails(recipients, subject, body)


_REQUESTER_EVENTS = {
    'approved': ("Your budget request (Ticket #{id}) is approved",
                 "Your budget request has been fully approved and the funds are now available to spend."),
    'rejected': ("Your budget request (Ticket #{id}) was rejected",
                 "Your budget request was rejected."),
}


def notify_requester(req, event, note=''):
    tmpl = _REQUESTER_EVENTS.get(event)
    if not tmpl:
        return 0
    recipients = valid_emails([req.requested_by])
    subject = tmpl[0].format(id=req.id)
    body = tmpl[1] + "\n\n" + _lines(req)
    if note:
        body += f"\nNote:\n{note}\n"
    body += "\nSee Budgets → My Budget."
    return queue_emails(recipients, subject, body)


# ---------------------------------------------------------------------------
# Employee expense claims — Manager → Finance → CEO
# ---------------------------------------------------------------------------
def can_claim_type(employee, claim_type, user=None):
    """May this employee apply for this specific claim type?"""
    if user is not None and getattr(user, 'is_superuser', False):
        return True
    if not employee or not claim_type:
        return False
    return claim_type.allowed_claimants.filter(pk=employee.pk).exists()


def can_claim(employee, user=None):
    """Is this employee allowed to submit any claim at all (any active type)?"""
    if user is not None and getattr(user, 'is_superuser', False):
        return True
    if not employee:
        return False
    return ClaimType.objects.filter(is_active=True, allowed_claimants=employee).exists()


def submit_claim(claim):
    """Start a claim down its claim-type pipeline (or the default). Stages with
    no approver — e.g. a Department-Manager stage where the claimant is the
    manager — are skipped automatically."""
    stages = pipeline_stages(pipeline_for_claim(claim))
    if not stages:
        raise PipelineNotConfigured(
            'This claim type has no approval pipeline attached. '
            'Ask an admin to attach one in Setup → Claim types.')
    step = _walk(stages, 1, claim.department, claim.claimant_id)
    if step is None:
        claim.status = 'APPROVED'
        claim.current_step = 0
        claim.save(update_fields=['status', 'current_step'])
        notify_claimant(claim, 'approved')
        return claim
    claim.status = 'PENDING'
    claim.current_step = step
    claim.save(update_fields=['status', 'current_step'])
    notify_claim_approvers(claim)
    return claim


def _current_claim_stage(claim):
    stages = pipeline_stages(pipeline_for_claim(claim))
    if claim.status == 'PENDING' and 1 <= claim.current_step <= len(stages):
        return stages[claim.current_step - 1]
    return None


def current_claim_stage_label(claim):
    stage = _current_claim_stage(claim)
    return stage_label(stage) if stage else None


def claim_can_act(claim, employee):
    if not employee or claim.status != 'PENDING':
        return False
    stage = _current_claim_stage(claim)
    if not stage:
        return False
    return any(e and e.id == employee.id for e in stage_approvers(stage, claim.department))


def act_on_claim(claim, employee, approve, note=''):
    if not claim_can_act(claim, employee):
        raise PermissionError('You are not an approver for this claim at its current stage.')
    stage = _current_claim_stage(claim)
    ClaimAction.objects.create(
        claim=claim, stage=stage_label(stage), approver=employee,
        status='APPROVED' if approve else 'REJECTED', note=note or '', acted_at=timezone.now(),
    )
    if not approve:
        claim.status = 'REJECTED'
        claim.save(update_fields=['status'])
        notify_claimant(claim, 'rejected', note)
        return claim, 'rejected'

    stages = pipeline_stages(pipeline_for_claim(claim))
    nxt = _walk(stages, claim.current_step + 1, claim.department, claim.claimant_id)
    if nxt is None:
        claim.status = 'APPROVED'
        claim.current_step = 0
        claim.save(update_fields=['status', 'current_step'])
        notify_claimant(claim, 'approved')
        return claim, 'approved'

    claim.current_step = nxt
    claim.save(update_fields=['current_step'])
    notify_claim_approvers(claim)
    return claim, 'advanced'


def claim_current_approvers(claim):
    stage = _current_claim_stage(claim)
    return stage_approvers(stage, claim.department) if stage else []


def _claim_lines(claim):
    return (
        f"Ticket No:  #{claim.id}\n"
        f"Employee:   {claim.claimant.name if claim.claimant else '—'}\n"
        f"Type:       {claim.claim_type.name if claim.claim_type else '—'}\n"
        f"Kind:       {claim.get_kind_display()}\n"
        f"Amount:     Rs {claim.amount}\n"
        f"Reason:     {claim.reason or '—'}\n"
    )


def notify_claim_approvers(claim):
    recipients = valid_emails(claim_current_approvers(claim))
    subject = f"Expense claim (Ticket #{claim.id}) needs your approval"
    body = "An employee expense claim is waiting for your approval.\n\n" + _claim_lines(claim) + "\nReview it in Budgets → Approvals."
    return queue_emails(recipients, subject, body)


_CLAIM_EVENTS = {
    'approved': ("Your expense claim (Ticket #{id}) is approved", "Your expense claim has been fully approved."),
    'rejected': ("Your expense claim (Ticket #{id}) was rejected", "Your expense claim was rejected."),
}


def notify_claimant(claim, event, note=''):
    tmpl = _CLAIM_EVENTS.get(event)
    if not tmpl:
        return 0
    recipients = valid_emails([claim.claimant])
    subject = tmpl[0].format(id=claim.id)
    body = tmpl[1] + "\n\n" + _claim_lines(claim)
    if note:
        body += f"\nNote:\n{note}\n"
    body += "\nSee your Employee Portal → My Expense Claims."
    return queue_emails(recipients, subject, body)
