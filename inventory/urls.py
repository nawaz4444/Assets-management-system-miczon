from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .password_reset import PasswordResetRequest, PasswordResetValidate, PasswordResetConfirm
from .views import (
    AssetViewSet, EmployeeViewSet, DepartmentViewSet, UploadAssetsView, 
    AssetAssignmentViewSet, InspectionLogViewSet, ReportsViewSet, CurrentUserView,
    AssetActionRequestViewSet, HealthCheckSessionViewSet, HealthCheckResponseViewSet,
    ScanAssetView, SuperCategoryViewSet
)

# Create a router and register our viewsets with it.
router = DefaultRouter()
router.register(r'super-categories', SuperCategoryViewSet)
router.register(r'assets', AssetViewSet)
router.register(r'employees', EmployeeViewSet)
router.register(r'departments', DepartmentViewSet)
router.register(r'assignments', AssetAssignmentViewSet)
router.register(r'inspections', InspectionLogViewSet)
router.register(r'requests', AssetActionRequestViewSet)
router.register(r'health-checks', HealthCheckSessionViewSet)
router.register(r'health-responses', HealthCheckResponseViewSet)
router.register(r'reports', ReportsViewSet, basename='reports')

# The API URLs are determined automatically by the router.
urlpatterns = [
    path('password-reset/request/', PasswordResetRequest.as_view()),
    path('password-reset/validate/', PasswordResetValidate.as_view()),
    path('password-reset/confirm/', PasswordResetConfirm.as_view()),
    # 1. Add the Auth Paths:
    path('auth/current-user/', CurrentUserView.as_view(), name='current-user'),
    path('scan/<str:miczon_id>/', ScanAssetView.as_view(), name='scan-asset'),
    # 2. Add the Upload Path explicitly:
    path('upload/', UploadAssetsView.as_view(), name='upload-assets'),
    path('admin/dashboard-stats/', ReportsViewSet.as_view({'get': 'dashboard_stats'}), name='admin-dashboard-stats'),
    
    # 2. Add the Router paths (assets, employees, etc.)
    path('', include(router.urls)),
]


