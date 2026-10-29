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
    DepartmentBudget, Expense,
)
from .notifications import queue_emails, valid_emails

ZERO = Decimal('0')


# ---------------------------------------------------------------------------
# Roles (Finance / CEO)
# ---------------------------------------------------------------------------
def employees_with_role(role):
    ids = BudgetRoleAssignment.objects.filter(role=role).values_list('employee_id', flat=True)
    return list(Employee.objects.filter(id__in=ids))


def has_role(employee, role):
    if not employee:
        return False
    return BudgetRoleAssignment.objects.filter(employee=employee, role=role).exists()


def role_ids_for_employee(employee):
    if not employee:
        return set()
    return set(BudgetRoleAssignment.objects.filter(employee=employee).values_list('role', flat=True))


# ---------------------------------------------------------------------------
# Approval — fixed Finance → CEO
# ---------------------------------------------------------------------------
def submit_request(req):
    req.status = 'PENDING_FINANCE'
    req.save(update_fields=['status'])
    notify_finance(req)
    return req


def can_act(req, employee):
    if not employee:
        return False
    if req.status == 'PENDING_FINANCE':
        return has_role(employee, 'FINANCE')
    if req.status == 'PENDING_CEO':
        return has_role(employee, 'CEO')
    return False


def act_on_request(req, employee, approve, note=''):
    """Approve or reject at the current stage. Returns (req, outcome) where
    outcome is 'advanced', 'approved' or 'rejected'."""
    if not can_act(req, employee):
        raise PermissionError('You are not an approver for this request at its current stage.')

    stage_finance = req.status == 'PENDING_FINANCE'
    ApprovalTask.objects.create(
        request=req, order=1 if stage_finance else 2, approver=employee,
        status='APPROVED' if approve else 'REJECTED', note=note or '', acted_at=timezone.now(),
    )

    if not approve:
        req.status = 'REJECTED'
        req.save(update_fields=['status'])
        notify_requester(req, 'rejected', note)
        return req, 'rejected'

    if stage_finance:
        req.status = 'PENDING_CEO'
        req.save(update_fields=['status'])
        notify_ceo(req)
        return req, 'advanced'

    req.status = 'APPROVED'
    req.save(update_fields=['status'])
    notify_requester(req, 'approved')
    return req, 'approved'


# ---------------------------------------------------------------------------
# Cycles & balance
# ---------------------------------------------------------------------------
def get_or_create_cycle_by_id(department_id, when=None, custodian=None):
    from inventory.models import Department
    return get_or_create_cycle(Department.objects.get(pk=department_id), when=when, custodian=custodian)


def previous_available(department, when):
    """Remaining balance of the month before `when` for this department."""
    pm, py = when.month - 1, when.year
    if pm < 1:
        pm, py = 12, when.year - 1
    prev = BudgetCycle.objects.filter(department=department, month=pm, year=py).first()
    return cycle_balance(prev)['available'] if prev else ZERO


def get_or_create_cycle(department, when=None, custodian=None):
    """Fetch the month's cycle, or create it carrying last month's remaining
    balance forward as its opening balance."""
    when = when or timezone.localdate()
    cycle = BudgetCycle.objects.filter(department=department, month=when.month, year=when.year).first()
    if cycle is None:
        cycle = BudgetCycle.objects.create(
            department=department, month=when.month, year=when.year,
            custodian=custodian, opening_balance=previous_available(department, when),
        )
    elif custodian and not cycle.custodian:
        cycle.custodian = custodian
        cycle.save(update_fields=['custodian'])
    return cycle


def current_cycle(department, custodian=None):
    """The department's active (OPEN) budget period. If none is open, open the
    next one, carrying the latest period's remaining balance forward. This is
    what 'this month' means in the UI — it follows Close Month, not the wall
    calendar, so closing a period moves the custodian into the next one."""
    cycle = BudgetCycle.objects.filter(department=department, status='OPEN').order_by('-year', '-month').first()
    if cycle is None:
        latest = BudgetCycle.objects.filter(department=department).order_by('-year', '-month').first()
        if latest:
            nm, ny = latest.month + 1, latest.year
            if nm > 12:
                nm, ny = 1, latest.year + 1
            opening = cycle_balance(latest)['available']
        else:
            today = timezone.localdate()
            nm, ny, opening = today.month, today.year, ZERO
        cycle = BudgetCycle.objects.create(
            department=department, month=nm, year=ny,
            custodian=custodian, opening_balance=opening,
        )
    if custodian and not cycle.custodian:
        cycle.custodian = custodian
        cycle.save(update_fields=['custodian'])
    return cycle


def current_cycle_by_id(department_id, custodian=None):
    from inventory.models import Department
    return current_cycle(Department.objects.get(pk=department_id), custodian=custodian)


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
        department=cycle.department, month=nm, year=ny,
        defaults={'custodian': cycle.custodian, 'opening_balance': bal['available']},
    )
    if not created:
        nxt.opening_balance = bal['available']
        nxt.save(update_fields=['opening_balance'])
    return nxt


def monthly_budget_for(department, when=None):
    """The department's fixed monthly budget, or None if unset."""
    when = when or timezone.localdate()
    b = DepartmentBudget.objects.filter(department=department, fiscal_year=when.year, is_active=True).first()
    if not b:
        return None
    return b.amount if b.period_type == 'MONTHLY' else (b.amount / 12)


# ---------------------------------------------------------------------------
# Notifications
# ---------------------------------------------------------------------------
def _lines(req):
    return (
        f"Request:    #{req.id}\n"
        f"Department: {req.department.name if req.department else '—'}\n"
        f"Amount:     Rs {req.amount}\n"
        f"Reason:     {req.reason or '—'}\n"
    )


def notify_finance(req):
    recipients = valid_emails(employees_with_role('FINANCE'))
    subject = f"Budget request #{req.id} needs Finance approval"
    body = "A department has requested a budget.\n\n" + _lines(req) + "\nReview it in Budgets → Approvals."
    return queue_emails(recipients, subject, body)


def notify_ceo(req):
    recipients = valid_emails(employees_with_role('CEO'))
    subject = f"Budget request #{req.id} needs CEO approval"
    body = "Finance has approved a budget request. It now needs your approval.\n\n" + _lines(req) + "\nReview it in Budgets → Approvals."
    return queue_emails(recipients, subject, body)


_REQUESTER_EVENTS = {
    'approved': ("Your budget request #{id} is approved",
                 "Your budget has been approved by the CEO and the funds are now available to spend."),
    'rejected': ("Your budget request #{id} was rejected",
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
