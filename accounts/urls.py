from django.urls import path, include
from rest_framework.routers import DefaultRouter

from .views import (
    DepreciationPolicyViewSet, AssetFinancialViewSet, DepreciationRunViewSet,
    DepreciationEntryViewSet, AssetDisposalViewSet, ReportsView,
)

router = DefaultRouter()
router.register(r'policies', DepreciationPolicyViewSet, basename='depreciation-policy')
router.register(r'asset-financials', AssetFinancialViewSet, basename='asset-financial')
router.register(r'runs', DepreciationRunViewSet, basename='depreciation-run')
router.register(r'entries', DepreciationEntryViewSet, basename='depreciation-entry')
router.register(r'disposals', AssetDisposalViewSet, basename='asset-disposal')

urlpatterns = [
    path('reports/<str:report>/', ReportsView.as_view(), name='accounts-report'),
    path('', include(router.urls)),
]
