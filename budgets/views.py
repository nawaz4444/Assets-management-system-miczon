import datetime
from decimal import Decimal, InvalidOperation

from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView

from django.db.models import Count, Q, Sum

from inventory.services import employee_for_user
from .models import (
    BudgetRoleAssignment, DepartmentBudget, AdvanceRequest, BudgetCycle, Expense, Bill,
    ClaimType, ExpenseClaim, ClaimBill, ApprovalPipeline, ApprovalStage, ApprovalRole,
)
from .serializers import (
    BudgetRoleAssignmentSerializer, DepartmentBudgetSerializer,
    AdvanceRequestSerializer, ExpenseSerializer, BillSerializer, BudgetCycleSerializer,
    ClaimTypeSerializer, ExpenseClaimSerializer, ClaimBillSerializer,
    ApprovalPipelineSerializer, ApprovalRoleSerializer,
)
from . import services


class IsAdminOrReadOnly(permissions.BasePermission):
    """Any authenticated non-stock user may read; only superusers may change setup."""
    message = 'Only administrators can change budget setup.'

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        if not user.is_superuser and user.groups.filter(name='Stock Only').exists():
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(user.is_superuser)


class IsBudgetUser(permissions.BasePermission):
    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        if not user.is_superuser and user.groups.filter(name='Stock Only').exists():
            return False
        return True


def _me(request):
    return employee_for_user(request.user)


def _date_range(qs, request):
    """Filter a queryset by ?from=YYYY-MM-DD & ?to=YYYY-MM-DD on created_at."""
    dfrom = request.query_params.get('from')
    dto = request.query_params.get('to')
    if dfrom:
        qs = qs.filter(created_at__date__gte=dfrom)
    if dto:
        qs = qs.filter(created_at__date__lte=dto)
    return qs


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
class ApprovalRoleViewSet(viewsets.ModelViewSet):
    """User-defined approval roles (Finance, CEO, Director, …)."""
    queryset = ApprovalRole.objects.all()
    serializer_class = ApprovalRoleSerializer
    permission_classes = [IsAdminOrReadOnly]

    def destroy(self, request, *args, **kwargs):
        role = self.get_object()
        in_use = role.stages.exists()
        if in_use:
            return Response(
                {'error': 'This role is used by one or more pipeline steps. Remove it from those steps first.'},
                status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)


class BudgetRoleAssignmentViewSet(viewsets.ModelViewSet):
    queryset = BudgetRoleAssignment.objects.select_related('employee', 'role').all()
    serializer_class = BudgetRoleAssignmentSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        qs = super().get_queryset()
        role = self.request.query_params.get('role')
        if role:
            qs = qs.filter(role_id=role)
        return qs


class DepartmentBudgetViewSet(viewsets.ModelViewSet):
    queryset = DepartmentBudget.objects.select_related('department', 'custodian').all()
    serializer_class = DepartmentBudgetSerializer
    permission_classes = [IsAdminOrReadOnly]

    @action(detail=False, methods=['get'])
    def mine(self, request):
        """The budget lines the caller works with: their own as custodian, or
        all of them for an admin. Optional ?department= filter."""
        emp = _me(request)
        qs = DepartmentBudget.objects.select_related('department', 'custodian').filter(is_active=True)
        if not request.user.is_superuser:
            qs = qs.filter(custodian=emp) if emp else qs.none()
        dept = request.query_params.get('department')
        if dept:
            qs = qs.filter(department_id=dept)
        return Response(DepartmentBudgetSerializer(qs, many=True).data)


# ---------------------------------------------------------------------------
# Advance requests — fixed Finance → CEO
# ---------------------------------------------------------------------------
class AdvanceRequestViewSet(viewsets.ModelViewSet):
    serializer_class = AdvanceRequestSerializer
    permission_classes = [IsBudgetUser]

    def _base_qs(self):
        return (AdvanceRequest.objects
                .select_related('department', 'requested_by')
                .prefetch_related('tasks__approver'))

    def get_queryset(self):
        user = self.request.user
        emp = _me(self.request)
        qs = self._base_qs()
        dept = self.request.query_params.get('department')
        if dept:
            qs = qs.filter(department_id=dept)
        cycle = self.request.query_params.get('cycle')
        if cycle:
            qs = qs.filter(cycle_id=cycle)
        scope = self.request.query_params.get('scope')

        if scope == 'mine':
            return qs.filter(requested_by=emp) if emp else qs.none()
        if scope == 'approvals':
            ids = [r.id for r in qs.filter(status='PENDING') if services.can_act(r, emp)]
            return qs.filter(id__in=ids)
        if scope == 'history':
            # The caller's approval track: every request they approved (any
            # stage, shown with its current status). Admins see all, all statuses.
            # Optional ?from/?to date range (on created_at) drives the UI filter.
            qs = _date_range(qs, self.request)
            if user.is_superuser:
                return qs.order_by('-id')
            if not emp:
                return qs.none()
            return qs.filter(tasks__approver=emp, tasks__status='APPROVED').distinct().order_by('-id')
        if user.is_superuser:
            return qs
        return qs.filter(requested_by=emp) if emp else qs.none()

    def create(self, request, *args, **kwargs):
        emp = _me(request)
        budget_id = request.data.get('budget')
        if not budget_id:
            return Response({'error': 'Select a budget to apply for.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            budget = DepartmentBudget.objects.get(pk=budget_id)
        except DepartmentBudget.DoesNotExist:
            return Response({'error': 'Budget not found.'}, status=status.HTTP_400_BAD_REQUEST)
        req = AdvanceRequest.objects.create(
            budget=budget,
            department=budget.department,
            requested_by=emp,
            amount=request.data.get('amount') or 0,
            reason=request.data.get('reason', ''),
            status='DRAFT',
        )
        req.cycle = services.current_cycle(budget, custodian=emp)
        req.save(update_fields=['cycle'])
        try:
            services.submit_request(req)
        except services.PipelineNotConfigured as exc:
            req.delete()
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        req = self._base_qs().get(pk=req.pk)
        return Response(self.get_serializer(req).data, status=status.HTTP_201_CREATED)

    def _act(self, request, pk, approve):
        emp = _me(request)
        try:
            req = self._base_qs().get(pk=pk)
        except AdvanceRequest.DoesNotExist:
            return Response({'error': 'Request not found.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            services.act_on_request(req, emp, approve, note=request.data.get('note', ''))
        except PermissionError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        req = self._base_qs().get(pk=req.pk)
        return Response(self.get_serializer(req).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        return self._act(request, pk, approve=True)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        return self._act(request, pk, approve=False)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        emp = _me(request)
        try:
            req = self._base_qs().get(pk=pk)
        except AdvanceRequest.DoesNotExist:
            return Response({'error': 'Request not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not (request.user.is_superuser or (emp and req.requested_by_id == emp.id)):
            return Response({'error': 'Only the requester can cancel this request.'}, status=status.HTTP_403_FORBIDDEN)
        if req.status == 'APPROVED':
            return Response({'error': 'This request is already approved.'}, status=status.HTTP_400_BAD_REQUEST)
        req.status = 'CANCELLED'
        req.save(update_fields=['status'])
        return Response(self.get_serializer(req).data)


# ---------------------------------------------------------------------------
# Expenses (title + amount + bill)
# ---------------------------------------------------------------------------
class ExpenseViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseSerializer
    permission_classes = [IsBudgetUser]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def get_queryset(self):
        qs = Expense.objects.select_related('created_by').prefetch_related('bills')
        cycle = self.request.query_params.get('cycle')
        if cycle:
            qs = qs.filter(cycle_id=cycle)
        department = self.request.query_params.get('department')
        if department:
            qs = qs.filter(cycle__department_id=department)
        return qs

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def create(self, request, *args, **kwargs):
        emp = _me(request)
        cycle_id = request.data.get('cycle')
        if cycle_id:
            try:
                cycle = BudgetCycle.objects.get(pk=cycle_id)
            except BudgetCycle.DoesNotExist:
                return Response({'error': 'Cycle not found.'}, status=status.HTTP_400_BAD_REQUEST)
        else:
            budget_id = request.data.get('budget')
            if not budget_id:
                return Response({'error': 'Select a budget.'}, status=status.HTTP_400_BAD_REQUEST)
            cycle = services.current_cycle_by_budget_id(budget_id, custodian=emp)
        if cycle.status == 'CLOSED':
            return Response({'error': 'This month is closed.'}, status=status.HTTP_400_BAD_REQUEST)

        create_kwargs = dict(
            cycle=cycle,
            title=(request.data.get('title') or '').strip() or 'Expense',
            amount=request.data.get('amount') or 0,
            note=request.data.get('note', ''),
            created_by=emp,
        )
        spent_on = request.data.get('spent_on')
        if spent_on:
            create_kwargs['spent_on'] = spent_on
        expense = Expense.objects.create(**create_kwargs)
        bill_file = request.FILES.get('bill')
        if bill_file:
            Bill.objects.create(expense=expense, file=bill_file)
        expense = self.get_queryset().get(pk=expense.pk)
        return Response(self.get_serializer(expense).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='add-bill')
    def add_bill(self, request, pk=None):
        try:
            expense = Expense.objects.get(pk=pk)
        except Expense.DoesNotExist:
            return Response({'error': 'Expense not found.'}, status=status.HTTP_404_NOT_FOUND)
        bill_file = request.FILES.get('bill') or request.FILES.get('file')
        if not bill_file:
            return Response({'error': 'No file uploaded.'}, status=status.HTTP_400_BAD_REQUEST)
        bill = Bill.objects.create(expense=expense, file=bill_file)
        return Response(BillSerializer(bill, context={'request': request}).data, status=status.HTTP_201_CREATED)


# ---------------------------------------------------------------------------
# Cycle summary + close
# ---------------------------------------------------------------------------
class BudgetCycleViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = BudgetCycleSerializer
    permission_classes = [IsBudgetUser]

    def get_queryset(self):
        qs = BudgetCycle.objects.select_related('department', 'custodian')
        department = self.request.query_params.get('department')
        if department:
            qs = qs.filter(department_id=department)
        return qs

    @action(detail=False, methods=['get'])
    def summary(self, request):
        emp = _me(request)
        budget_id = request.query_params.get('budget')
        if not budget_id:
            return Response({'error': 'Select a budget.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            budget = DepartmentBudget.objects.select_related('department').get(pk=budget_id)
        except DepartmentBudget.DoesNotExist:
            return Response({'error': 'Budget not found.'}, status=status.HTTP_400_BAD_REQUEST)
        cycle = services.current_cycle(budget, custodian=emp)
        balance = services.cycle_balance(cycle)
        prev_available = services.previous_available(budget, datetime.date(cycle.year, cycle.month, 1))
        return Response({
            'cycle': BudgetCycleSerializer(cycle).data,
            'balance': {k: str(v) for k, v in balance.items()},
            'monthly_budget': str(budget.amount),
            'prev_available': str(prev_available),
        })

    @action(detail=True, methods=['post'], url_path='set-opening')
    def set_opening(self, request, pk=None):
        emp = _me(request)
        try:
            cycle = BudgetCycle.objects.get(pk=pk)
        except BudgetCycle.DoesNotExist:
            return Response({'error': 'Cycle not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not (request.user.is_superuser or (emp and cycle.custodian_id == emp.id)):
            return Response({'error': 'Only the custodian can change the carried-over balance.'}, status=status.HTTP_403_FORBIDDEN)
        if cycle.status == 'CLOSED':
            return Response({'error': 'This month is closed.'}, status=status.HTTP_400_BAD_REQUEST)
        try:
            amount = Decimal(str(request.data.get('amount')))
        except (InvalidOperation, TypeError):
            return Response({'error': 'Enter a valid amount.'}, status=status.HTTP_400_BAD_REQUEST)
        services.set_cycle_opening(cycle, amount)
        return Response(BudgetCycleSerializer(cycle).data)

    @action(detail=True, methods=['post'])
    def close(self, request, pk=None):
        emp = _me(request)
        try:
            cycle = BudgetCycle.objects.get(pk=pk)
        except BudgetCycle.DoesNotExist:
            return Response({'error': 'Cycle not found.'}, status=status.HTTP_404_NOT_FOUND)
        is_custodian = emp and cycle.custodian_id == emp.id
        if not (request.user.is_superuser or is_custodian):
            return Response({'error': 'Only the custodian can close the month.'}, status=status.HTTP_403_FORBIDDEN)
        nxt = services.close_cycle(cycle)
        return Response({'closed': BudgetCycleSerializer(cycle).data, 'next': BudgetCycleSerializer(nxt).data})


# ---------------------------------------------------------------------------
# Access
# ---------------------------------------------------------------------------
class ClaimTypeViewSet(viewsets.ModelViewSet):
    queryset = ClaimType.objects.prefetch_related('allowed_claimants').all()
    serializer_class = ClaimTypeSerializer
    permission_classes = [IsAdminOrReadOnly]

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.query_params.get('is_active') in ('true', '1'):
            qs = qs.filter(is_active=True)
        if self.request.query_params.get('mine') in ('true', '1') and not self.request.user.is_superuser:
            emp = _me(self.request)
            qs = qs.filter(allowed_claimants=emp) if emp else qs.none()
        return qs


class ApprovalPipelineViewSet(viewsets.ModelViewSet):
    """Admin-configurable, named, reusable approval chains. A pipeline is
    attached to budget categories (DepartmentBudget.pipeline) and claim types
    (ClaimType.pipeline). The whole ordered stage list is replaced in one call
    via `set-stages`; a stage's role is an ApprovalRole id."""
    queryset = ApprovalPipeline.objects.prefetch_related('stages__people', 'stages__role').all()
    serializer_class = ApprovalPipelineSerializer
    permission_classes = [IsAdminOrReadOnly]

    def destroy(self, request, *args, **kwargs):
        pipeline = self.get_object()
        uses = pipeline.budget_categories.count() + pipeline.claim_types.count()
        if uses:
            return Response(
                {'error': f'This pipeline is attached to {uses} budget categor{"y" if uses == 1 else "ies"}/claim '
                          f'type(s). Detach it there before deleting.'},
                status=status.HTTP_400_BAD_REQUEST)
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['post'], url_path='set-stages')
    def set_stages(self, request, pk=None):
        pipeline = self.get_object()
        stages = request.data.get('stages', [])
        if not isinstance(stages, list):
            return Response({'error': 'stages must be a list.'}, status=status.HTTP_400_BAD_REQUEST)
        pipeline.stages.all().delete()
        for i, s in enumerate(stages, start=1):
            kind = s.get('approver_kind') or 'ROLE'
            stage = ApprovalStage.objects.create(
                pipeline=pipeline, order=i, approver_kind=kind,
                role_id=(s.get('role') or None) if kind == 'ROLE' else None,
                label=s.get('label') or '',
            )
            if kind == 'PERSON':
                stage.people.set([p for p in (s.get('people') or []) if p])
        pipeline.refresh_from_db()
        return Response(self.get_serializer(pipeline).data)


class ExpenseClaimViewSet(viewsets.ModelViewSet):
    serializer_class = ExpenseClaimSerializer
    permission_classes = [IsBudgetUser]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def _base_qs(self):
        return (ExpenseClaim.objects
                .select_related('claimant', 'department', 'claim_type')
                .prefetch_related('actions__approver', 'bills'))

    def get_serializer_context(self):
        ctx = super().get_serializer_context()
        ctx['request'] = self.request
        return ctx

    def get_queryset(self):
        user = self.request.user
        emp = _me(self.request)
        qs = self._base_qs()
        scope = self.request.query_params.get('scope')
        if scope == 'mine':
            return qs.filter(claimant=emp) if emp else qs.none()
        if scope == 'approvals':
            ids = [c.id for c in qs.filter(status='PENDING') if services.claim_can_act(c, emp)]
            return qs.filter(id__in=ids)
        if scope == 'history':
            # Claims the caller approved (any stage, current status shown).
            # Admins see all claims, all statuses. Optional ?from/?to date range.
            qs = _date_range(qs, self.request)
            if user.is_superuser:
                return qs.order_by('-id')
            if not emp:
                return qs.none()
            return qs.filter(actions__approver=emp, actions__status='APPROVED').distinct().order_by('-id')
        if user.is_superuser:
            return qs
        return qs.filter(claimant=emp) if emp else qs.none()

    def create(self, request, *args, **kwargs):
        emp = _me(request)
        claim_type_id = request.data.get('claim_type')
        claim_type = None
        if claim_type_id:
            try:
                claim_type = ClaimType.objects.get(pk=claim_type_id)
            except ClaimType.DoesNotExist:
                return Response({'error': 'Claim type not found.'}, status=status.HTTP_400_BAD_REQUEST)
        if not (claim_type and services.can_claim_type(emp, claim_type, user=request.user)):
            return Response({'error': 'You are not allowed to submit this type of claim.'}, status=status.HTTP_403_FORBIDDEN)
        claim = ExpenseClaim.objects.create(
            claimant=emp,
            department=emp.department if emp else None,
            claim_type=claim_type,
            kind=request.data.get('kind') or 'REIMBURSEMENT',
            amount=request.data.get('amount') or 0,
            reason=request.data.get('reason', ''),
            status='PENDING',
        )
        try:
            services.submit_claim(claim)
        except services.PipelineNotConfigured as exc:
            claim.delete()
            return Response({'error': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        bill_file = request.FILES.get('bill')
        if bill_file:
            ClaimBill.objects.create(claim=claim, file=bill_file)
        claim = self._base_qs().get(pk=claim.pk)
        return Response(self.get_serializer(claim).data, status=status.HTTP_201_CREATED)

    def _act(self, request, pk, approve):
        emp = _me(request)
        try:
            claim = self._base_qs().get(pk=pk)
        except ExpenseClaim.DoesNotExist:
            return Response({'error': 'Claim not found.'}, status=status.HTTP_404_NOT_FOUND)
        try:
            services.act_on_claim(claim, emp, approve, note=request.data.get('note', ''))
        except PermissionError as exc:
            return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)
        claim = self._base_qs().get(pk=claim.pk)
        return Response(self.get_serializer(claim).data)

    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        return self._act(request, pk, approve=True)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        return self._act(request, pk, approve=False)

    @action(detail=True, methods=['post'])
    def cancel(self, request, pk=None):
        emp = _me(request)
        try:
            claim = self._base_qs().get(pk=pk)
        except ExpenseClaim.DoesNotExist:
            return Response({'error': 'Claim not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not (request.user.is_superuser or (emp and claim.claimant_id == emp.id)):
            return Response({'error': 'Only the claimant can cancel this claim.'}, status=status.HTTP_403_FORBIDDEN)
        if claim.status in ('APPROVED', 'REJECTED', 'CANCELLED'):
            return Response({'error': 'This claim is already finalised.'}, status=status.HTTP_400_BAD_REQUEST)
        claim.status = 'CANCELLED'
        claim.save(update_fields=['status'])
        return Response(self.get_serializer(claim).data)

    @action(detail=True, methods=['post'], url_path='add-bill')
    def add_bill(self, request, pk=None):
        try:
            claim = ExpenseClaim.objects.get(pk=pk)
        except ExpenseClaim.DoesNotExist:
            return Response({'error': 'Claim not found.'}, status=status.HTTP_404_NOT_FOUND)
        bill_file = request.FILES.get('bill') or request.FILES.get('file')
        if not bill_file:
            return Response({'error': 'No file uploaded.'}, status=status.HTTP_400_BAD_REQUEST)
        bill = ClaimBill.objects.create(claim=claim, file=bill_file)
        return Response(ClaimBillSerializer(bill, context={'request': request}).data, status=status.HTTP_201_CREATED)


class MyAccessView(APIView):
    permission_classes = [IsBudgetUser]

    def get(self, request):
        user = request.user
        emp = _me(request)
        is_approver = services.has_any_role(emp)
        is_manager = bool(emp and emp.managed_departments.exists())
        is_custodian = bool(emp and DepartmentBudget.objects.filter(custodian=emp, is_active=True).exists())

        approvals_count = 0
        if emp:
            approvals_count += sum(
                1 for r in AdvanceRequest.objects.filter(status='PENDING') if services.can_act(r, emp))
            approvals_count += sum(
                1 for c in ExpenseClaim.objects.filter(status='PENDING') if services.claim_can_act(c, emp))

        return Response({
            'employee_id': emp.id if emp else None,
            'name': emp.name if emp else user.get_username(),
            'department': emp.department_id if emp else None,
            'department_name': emp.department.name if (emp and emp.department) else None,
            'is_admin': bool(user.is_superuser),
            # True when the employee holds any approval role — the elevated
            # (all-departments) gate for the dashboard and history.
            'is_approver': is_approver,
            'is_manager': is_manager,
            'is_custodian': is_custodian,
            'is_claimant': services.can_claim(emp, user=user),
            'approvals_count': approvals_count,
        })


# ---------------------------------------------------------------------------
# Dashboard — permission-scoped budget + claim totals, per department
# ---------------------------------------------------------------------------
class DashboardView(APIView):
    """Fiscal-year-to-date roll-up. Finance/CEO/admin see every department;
    a custodian sees only the departments they hold a budget in. The frontend
    toggles Budget / Expense and filters by the department dropdown client-side,
    so everything the caller may see is returned in one payload."""
    permission_classes = [IsBudgetUser]

    def get(self, request):
        from inventory.models import Department
        user = request.user
        emp = _me(request)
        can_all = bool(user.is_superuser or services.has_any_role(emp))
        zero = Decimal('0')

        if can_all:
            budget_dept_ids = set(DepartmentBudget.objects.filter(is_active=True).values_list('department_id', flat=True))
            claim_dept_ids = set(ExpenseClaim.objects.values_list('department_id', flat=True))
            dept_qs = Department.objects.filter(id__in=(budget_dept_ids | claim_dept_ids))
        else:
            dept_ids = set(DepartmentBudget.objects.filter(custodian=emp, is_active=True)
                           .values_list('department_id', flat=True)) if emp else set()
            dept_qs = Department.objects.filter(id__in=dept_ids)
        dept_qs = dept_qs.order_by('name')
        dept_ids = list(dept_qs.values_list('id', flat=True))
        departments = [{'id': d.id, 'name': d.name} for d in dept_qs]

        # Budget lines: year-to-date allocated / spent / remaining per budget
        # line, summed across all its cycles. allocated = opening of the first
        # cycle + every approved request; remaining = allocated − spent.
        budget_lines = []
        budgets = (DepartmentBudget.objects
                   .filter(is_active=True, department_id__in=dept_ids)
                   .select_related('department'))
        for b in budgets:
            cycles = list(b.cycles.all())
            cycle_ids = [c.id for c in cycles]
            opening0 = zero
            if cycles:
                first = min(cycles, key=lambda c: (c.year, c.month))
                opening0 = first.opening_balance or zero
            received = (AdvanceRequest.objects.filter(cycle_id__in=cycle_ids, status='APPROVED')
                        .aggregate(s=Sum('amount'))['s'] or zero) if cycle_ids else zero
            spent = (Expense.objects.filter(cycle_id__in=cycle_ids)
                     .aggregate(s=Sum('amount'))['s'] or zero) if cycle_ids else zero
            allocated = opening0 + received
            budget_lines.append({
                'budget_id': b.id,
                'department_id': b.department_id,
                'department_name': b.department.name,
                'category': b.name,
                'monthly': str(b.amount),
                'allocated': str(allocated),
                'spent': str(spent),
                'remaining': str(allocated - spent),
            })

        # Claim totals per department (by claimant's department)
        claim_rows = []
        pending = ['PENDING', 'PENDING_MANAGER', 'PENDING_FINANCE', 'PENDING_CEO']
        for d in dept_qs:
            base = ExpenseClaim.objects.filter(department_id=d.id)

            def agg(statuses=None, _base=base, _zero=zero):
                q = _base if statuses is None else _base.filter(status__in=statuses)
                r = q.aggregate(s=Sum('amount'), c=Count('id'))
                return str(r['s'] or _zero), r['c'] or 0

            total_s, total_c = agg()
            appr_s, appr_c = agg(['APPROVED'])
            pend_s, pend_c = agg(pending)
            rej_s, rej_c = agg(['REJECTED'])
            claim_rows.append({
                'department_id': d.id, 'department_name': d.name,
                'total': total_s, 'total_count': total_c,
                'approved': appr_s, 'approved_count': appr_c,
                'pending': pend_s, 'pending_count': pend_c,
                'rejected': rej_s, 'rejected_count': rej_c,
            })

        return Response({
            'can_all': can_all,
            'departments': departments,
            'budget_lines': budget_lines,
            'claim_rows': claim_rows,
        })
