"""
Backend test suite for the stock_management app.

    python manage.py test stock_management

Covers the stock quantity math (create/delete transactions), the bulk
inbound/outbound endpoints (including the supplier regression), and the
IsAdminUserOrReadOnly permission model.
"""
from django.contrib.auth.models import User
from rest_framework import status
from rest_framework.test import APITestCase

from .models import StockCategory, StockProduct, StockTransaction


class StockBaseTestCase(APITestCase):
    def setUp(self):
        self.admin = User.objects.create_superuser('admin', 'admin@example.com', 'pw-admin-123')
        self.user = User.objects.create_user('emp', 'emp@example.com', 'pw-emp-123')
        self.category = StockCategory.objects.create(name='Peripherals')
        self.product = StockProduct.objects.create(
            code='CON-TEST-1', name='Test Mouse', category=self.category, qty=10, reorder=5,
        )


class StockMathTests(StockBaseTestCase):
    def test_in_transaction_increases_qty(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/stock/transactions/', {
            'date': '2026-08-24', 'product': self.product.id, 'type': 'IN', 'qty': 5, 'unit': 'pieces',
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.product.refresh_from_db()
        self.assertEqual(self.product.qty, 15)

    def test_out_transaction_decreases_qty(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/stock/transactions/', {
            'date': '2026-08-24', 'product': self.product.id, 'type': 'OUT', 'qty': 4, 'unit': 'pieces',
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.product.refresh_from_db()
        self.assertEqual(self.product.qty, 6)

    def test_out_transaction_never_goes_negative(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/stock/transactions/', {
            'date': '2026-08-24', 'product': self.product.id, 'type': 'OUT', 'qty': 999, 'unit': 'pieces',
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        self.product.refresh_from_db()
        self.assertEqual(self.product.qty, 0)

    def test_delete_in_transaction_reverses_qty(self):
        self.client.force_authenticate(self.admin)
        tx = StockTransaction.objects.create(
            date='2026-08-24', product=self.product, type='IN', qty=5, unit='pieces',
        )
        # Model create() doesn't adjust qty (that's in the viewset); simulate the applied state.
        self.product.qty = 15
        self.product.save()
        res = self.client.delete(f'/api/stock/transactions/{tx.id}/')
        self.assertEqual(res.status_code, status.HTTP_204_NO_CONTENT)
        self.product.refresh_from_db()
        self.assertEqual(self.product.qty, 10)


class BulkEndpointTests(StockBaseTestCase):
    def test_bulk_in_stores_supplier_in_details(self):
        """Regression: the supplier field must be persisted, not dropped."""
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/stock/transactions/bulk_in/', {
            'date': '2026-08-24',
            'supplier': 'Acme Distributors',
            'transactions': [{'product_code': self.product.code, 'qty': 7, 'unit': 'boxes'}],
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        tx = StockTransaction.objects.get(product=self.product, type='IN')
        self.assertEqual(tx.details, 'Acme Distributors')
        self.product.refresh_from_db()
        self.assertEqual(self.product.qty, 17)

    def test_bulk_in_without_supplier_falls_back(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/stock/transactions/bulk_in/', {
            'date': '2026-08-24',
            'transactions': [{'product_code': self.product.code, 'qty': 2, 'unit': 'pieces'}],
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)
        tx = StockTransaction.objects.get(product=self.product, type='IN')
        self.assertEqual(tx.details, 'Bulk Inbound Registry')

    def test_bulk_out_requires_demand_by(self):
        self.client.force_authenticate(self.admin)
        res = self.client.post('/api/stock/transactions/bulk_out/', {
            'date': '2026-08-24',
            'transactions': [{'product_code': self.product.code, 'qty': 1, 'unit': 'pieces'}],
        }, format='json')
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)


class StockPermissionTests(StockBaseTestCase):
    def test_regular_user_can_read_products(self):
        self.client.force_authenticate(self.user)
        res = self.client.get('/api/stock/products/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_regular_user_cannot_create_product(self):
        self.client.force_authenticate(self.user)
        res = self.client.post('/api/stock/products/', {
            'code': 'CON-HACK', 'name': 'Nope', 'category': self.category.id,
        })
        self.assertEqual(res.status_code, status.HTTP_403_FORBIDDEN)
