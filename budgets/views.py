import datetime
from decimal import Decimal, InvalidOperation

from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView

from inventory.services import employee_for_user
from .models import (
    BudgetRoleAssignment, DepartmentBudget, AdvanceRequest, BudgetCycle, Expense, Bill,
)
from .serializers import (
    BudgetRoleAssignmentSerializer, DepartmentBudgetSerializer,
    AdvanceRequestSerializer, ExpenseSerializer, BillSerializer, BudgetCycleSerializer,
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


# ---------------------------------------------------------------------------
# Setup
# ---------------------------------------------------------------------------
class BudgetRoleAssignmentViewSet(viewsets.ModelViewSet):
    queryset = BudgetRoleAssignment.objects.select_related('employee').all()
    serializer_class = BudgetRoleAssignmentSerializer
    permission_classes = [IsAdminOrReadOnly]


class DepartmentBudgetViewSet(viewsets.ModelViewSet):
    queryset = DepartmentBudget.objects.select_related('department', 'custodian').all()
    serializer_class = DepartmentBudgetSerializer
    permission_classes = [IsAdminOrReadOnly]


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
            roles = services.role_ids_for_employee(emp)
            conds = []
            if 'FINANCE' in roles:
                conds.append('PENDING_FINANCE')
            if 'CEO' in roles:
                conds.append('PENDING_CEO')
            if not conds:
                return qs.none()
            return qs.filter(status__in=conds)
        if user.is_superuser:
            return qs
        return qs.filter(requested_by=emp) if emp else qs.none()

    def create(self, request, *args, **kwargs):
        emp = _me(request)
        department_id = request.data.get('department') or (emp.department_id if emp else None)
        if not department_id:
            return Response({'error': 'No department set for your account.'}, status=status.HTTP_400_BAD_REQUEST)
        req = AdvanceRequest.objects.create(
            department_id=department_id,
            requested_by=emp,
            amount=request.data.get('amount') or 0,
            reason=request.data.get('reason', ''),
            status='DRAFT',
        )
        req.cycle = services.current_cycle(req.department, custodian=emp)
        req.save(update_fields=['cycle'])
        services.submit_request(req)
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
            department_id = request.data.get('department') or (emp.department_id if emp else None)
            if not department_id:
                return Response({'error': 'No department set for your account.'}, status=status.HTTP_400_BAD_REQUEST)
            cycle = services.current_cycle_by_id(department_id, custodian=emp)
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
        department_id = request.query_params.get('department') or (emp.department_id if emp else None)
        if not department_id:
            return Response({'error': 'No department set for your account.'}, status=status.HTTP_400_BAD_REQUEST)
        cycle = services.current_cycle_by_id(department_id, custodian=emp)
        balance = services.cycle_balance(cycle)
        monthly_budget = services.monthly_budget_for(cycle.department)
        prev_available = services.previous_available(cycle.department, datetime.date(cycle.year, cycle.month, 1))
        return Response({
            'cycle': BudgetCycleSerializer(cycle).data,
            'balance': {k: str(v) for k, v in balance.items()},
            'monthly_budget': str(monthly_budget) if monthly_budget is not None else None,
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
class MyAccessView(APIView):
    permission_classes = [IsBudgetUser]

    def get(self, request):
        user = request.user
        emp = _me(request)
        roles = services.role_ids_for_employee(emp)
        approvals_count = 0
        if emp:
            conds = []
            if 'FINANCE' in roles:
                conds.append('PENDING_FINANCE')
            if 'CEO' in roles:
                conds.append('PENDING_CEO')
            if conds:
                approvals_count = AdvanceRequest.objects.filter(status__in=conds).count()
        return Response({
            'employee_id': emp.id if emp else None,
            'name': emp.name if emp else user.get_username(),
            'department': emp.department_id if emp else None,
            'department_name': emp.department.name if (emp and emp.department) else None,
            'is_admin': bool(user.is_superuser),
            'is_finance': 'FINANCE' in roles,
            'is_ceo': 'CEO' in roles,
            'approvals_count': approvals_count,
        })
