from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import StockCategoryViewSet, StockProductViewSet, StockTransactionViewSet

router = DefaultRouter()
router.register(r'categories', StockCategoryViewSet, basename='categories')
router.register(r'products', StockProductViewSet, basename='products')
router.register(r'transactions', StockTransactionViewSet, basename='transactions')

app_name = 'stock_management'

urlpatterns = [
    path('', include(router.urls)),
]
