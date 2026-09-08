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
        self.assertEqual(res.status_code, status.HTTP_400_BAD_REQUEST)
        self.product.refresh_from_db()
        self.assertEqual(self.product.qty, 10)
        self.assertFalse(StockTransaction.objects.exists())

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
    """Stock is a shared consumables module (not asset management): any
    authenticated user may read AND write — no admin-only restriction."""

    def test_regular_user_can_read_products(self):
        self.client.force_authenticate(self.user)
        res = self.client.get('/api/stock/products/')
        self.assertEqual(res.status_code, status.HTTP_200_OK)

    def test_regular_user_can_create_product(self):
        self.client.force_authenticate(self.user)
        res = self.client.post('/api/stock/products/', {
            'code': 'CON-NEW', 'name': 'New Consumable', 'category': self.category.id,
        })
        self.assertEqual(res.status_code, status.HTTP_201_CREATED)

    def test_unauthenticated_user_cannot_access(self):
        res = self.client.get('/api/stock/products/')
        self.assertIn(res.status_code, (status.HTTP_401_UNAUTHORIZED, status.HTTP_403_FORBIDDEN))


class StockIntegrityRegressionTests(StockBaseTestCase):
    def setUp(self):
        super().setUp()
        self.client.force_authenticate(self.admin)

    def test_negative_and_zero_quantities_rejected(self):
        for qty in (-1, 0):
            res = self.client.post('/api/stock/transactions/', {'product': self.product.pk, 'date': '2026-09-04', 'type': 'OUT', 'qty': qty})
            self.assertEqual(res.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.qty, 10)

    def test_unknown_bulk_product_rejects_entire_batch(self):
        res = self.client.post('/api/stock/transactions/bulk_in/', {'date': '2026-09-04', 'transactions': [
            {'product_code': self.product.code, 'qty': 3}, {'product_code': 'UNKNOWN', 'qty': 2}]}, format='json')
        self.assertEqual(res.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.qty, 10)
        self.assertFalse(StockTransaction.objects.exists())

    def test_repeated_product_cannot_oversell_in_one_batch(self):
        res = self.client.post('/api/stock/transactions/bulk_out/', {'date': '2026-09-04', 'demand_by': 'QA', 'transactions': [
            {'product_code': self.product.code, 'qty': 6}, {'product_code': self.product.code, 'qty': 6}]}, format='json')
        self.assertEqual(res.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.qty, 10)

    def test_create_reverse_round_trip_preserves_stock(self):
        res = self.client.post('/api/stock/transactions/', {'product': self.product.pk, 'date': '2026-09-04', 'type': 'OUT', 'qty': 4})
        self.assertEqual(res.status_code, 201)
        self.assertEqual(self.client.delete(f"/api/stock/transactions/{res.data['id']}/").status_code, 204)
        self.product.refresh_from_db()
        self.assertEqual(self.product.qty, 10)

    def test_edit_consumed_receipt_is_rejected_without_partial_write(self):
        tx = StockTransaction.objects.create(product=self.product, date='2026-09-04', type='IN', qty=10)
        self.product.qty = 2
        self.product.save()
        res = self.client.patch(f'/api/stock/transactions/{tx.pk}/', {'qty': 1})
        self.assertEqual(res.status_code, 400)
        tx.refresh_from_db()
        self.product.refresh_from_db()
        self.assertEqual(tx.qty, 10)
        self.assertEqual(self.product.qty, 2)

    def test_reads_do_not_seed_demo_records(self):
        StockProduct.objects.all().delete()
        self.assertEqual(self.client.get('/api/stock/products/').data, [])
        self.assertEqual(self.client.get('/api/stock/transactions/').data, [])

    def test_product_patch_cannot_bypass_stock_ledger(self):
        self.client.patch(f'/api/stock/products/{self.product.pk}/', {'qty': -99})
        self.product.refresh_from_db()
        self.assertEqual(self.product.qty, 10)

    def test_batch_edit_rolls_back_all_rows_when_one_is_invalid(self):
        ids = []
        for qty in [2, 3]:
            result = self.client.post('/api/stock/transactions/', {'product': self.product.pk, 'date': '2026-09-04', 'type': 'OUT', 'qty': qty})
            ids.append(result.data['id'])
        result = self.client.post('/api/stock/transactions/batch-change/', {'ids': ids, 'transactions': [
            {'id': ids[0], 'product': self.product.pk, 'date': '2026-09-04', 'type': 'OUT', 'qty': 1},
            {'id': ids[1], 'product': self.product.pk, 'date': '2026-09-04', 'type': 'OUT', 'qty': 20}]}, format='json')
        self.assertEqual(result.status_code, 400)
        self.product.refresh_from_db()
        self.assertEqual(self.product.qty, 5)
        self.assertEqual(list(StockTransaction.objects.order_by('pk').values_list('qty', flat=True)), [2, 3])

    def test_batch_delete_balances_combined_transaction_effects(self):
        receipt = self.client.post('/api/stock/transactions/', {'product': self.product.pk, 'date': '2026-09-04', 'type': 'IN', 'qty': 5}).data['id']
        issue = self.client.post('/api/stock/transactions/', {'product': self.product.pk, 'date': '2026-09-04', 'type': 'OUT', 'qty': 12}).data['id']
        result = self.client.post('/api/stock/transactions/batch-change/', {'ids': [receipt, issue], 'delete': True}, format='json')
        self.assertEqual(result.status_code, 200)
        self.product.refresh_from_db()
        self.assertEqual(self.product.qty, 10)
        self.assertFalse(StockTransaction.objects.exists())

    def test_dashboard_summary_and_transaction_type_filter(self):
        self.client.post('/api/stock/transactions/', {
            'product': self.product.pk, 'date': '2026-09-04', 'type': 'IN', 'qty': 5,
        })
        self.client.post('/api/stock/transactions/', {
            'product': self.product.pk, 'date': '2026-09-04', 'type': 'OUT', 'qty': 3,
        })

        summary = self.client.get('/api/stock/products/summary/')
        self.assertEqual(summary.status_code, 200)
        self.assertEqual(summary.data, {
            'product_count': 1, 'low_stock_count': 0, 'total_in_qty': 5, 'total_out_qty': 3,
        })
        outbound = self.client.get('/api/stock/transactions/?type=OUT')
        self.assertEqual(len(outbound.data), 1)
        self.assertEqual(outbound.data[0]['type'], 'OUT')
