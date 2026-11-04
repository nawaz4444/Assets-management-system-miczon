from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    BudgetRoleAssignmentViewSet, DepartmentBudgetViewSet,
    AdvanceRequestViewSet, ExpenseViewSet, BudgetCycleViewSet, MyAccessView,
    ClaimTypeViewSet, ExpenseClaimViewSet, DashboardView, ApprovalPipelineViewSet,
    ApprovalRoleViewSet,
)

router = DefaultRouter()
router.register(r'roles', ApprovalRoleViewSet, basename='approval-role')
router.register(r'role-assignments', BudgetRoleAssignmentViewSet, basename='role-assignment')
router.register(r'department-budgets', DepartmentBudgetViewSet, basename='department-budget')
router.register(r'advance-requests', AdvanceRequestViewSet, basename='advance-request')
router.register(r'expenses', ExpenseViewSet, basename='expense')
router.register(r'cycles', BudgetCycleViewSet, basename='budget-cycle')
router.register(r'claim-types', ClaimTypeViewSet, basename='claim-type')
router.register(r'expense-claims', ExpenseClaimViewSet, basename='expense-claim')
router.register(r'pipelines', ApprovalPipelineViewSet, basename='approval-pipeline')

urlpatterns = [
    path('my-access/', MyAccessView.as_view(), name='budget-my-access'),
    path('dashboard/', DashboardView.as_view(), name='budget-dashboard'),
    path('', include(router.urls)),
]
