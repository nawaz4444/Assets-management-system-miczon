from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    BudgetRoleAssignmentViewSet, DepartmentBudgetViewSet,
    AdvanceRequestViewSet, ExpenseViewSet, BudgetCycleViewSet, MyAccessView,
)

router = DefaultRouter()
router.register(r'role-assignments', BudgetRoleAssignmentViewSet, basename='role-assignment')
router.register(r'department-budgets', DepartmentBudgetViewSet, basename='department-budget')
router.register(r'advance-requests', AdvanceRequestViewSet, basename='advance-request')
router.register(r'expenses', ExpenseViewSet, basename='expense')
router.register(r'cycles', BudgetCycleViewSet, basename='budget-cycle')

urlpatterns = [
    path('my-access/', MyAccessView.as_view(), name='budget-my-access'),
    path('', include(router.urls)),
]
