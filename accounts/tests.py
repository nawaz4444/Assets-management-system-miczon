from datetime import date
from decimal import Decimal

from django.contrib.auth.models import User
from django.db.models import Count, Sum
from django.test import TestCase
from rest_framework.renderers import JSONRenderer

from inventory.models import Asset, SuperCategory
from accounts.models import (
    DepreciationPolicy, AssetFinancial, DepreciationRun, DepreciationEntry, AssetDisposal,
)
from accounts.services import compute_monthly_wdv, run_depreciation
from accounts.serializers import AssetFinancialSerializer, DepreciationRunSerializer


class ComputeMonthlyWdvTests(TestCase):
    def test_normal_month(self):
        # 100000 * 33.33% / 12 = 2777.50
        self.assertEqual(
            compute_monthly_wdv(Decimal('100000'), Decimal('33.33'), Decimal('5000')),
            Decimal('2777.50'),
        )

    def test_clamps_to_salvage_floor(self):
        # raw would be 5100 * 100% / 12 = 425, but only 100 remains above salvage
        self.assertEqual(
            compute_monthly_wdv(Decimal('5100'), Decimal('100'), Decimal('5000')),
            Decimal('100.00'),
        )

    def test_zero_when_at_or_below_salvage(self):
        self.assertEqual(
            compute_monthly_wdv(Decimal('5000'), Decimal('33.33'), Decimal('5000')),
            Decimal('0.00'),
        )

    def test_zero_rate(self):
        self.assertEqual(
            compute_monthly_wdv(Decimal('100000'), Decimal('0'), Decimal('0')),
            Decimal('0.00'),
        )


class RunDepreciationTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('acct', password='x')
        self.sc = SuperCategory.objects.create(name='Test IT', code='test_it')
        DepreciationPolicy.objects.create(
            super_category=self.sc, annual_rate=Decimal('33.33'), salvage_percent=Decimal('5'),
        )

    def _asset(self, miczon_id, price='100000', pdate=date(2025, 1, 1), sc=True):
        return Asset.objects.create(
            miczon_id=miczon_id, name=f'Device {miczon_id}',
            super_category=self.sc if sc else None,
            purchase_price=Decimal(price) if price is not None else None,
            purchase_date=pdate,
        )

    def test_preview_does_not_persist(self):
        fin = AssetFinancial.objects.create(asset=self._asset('A1'))
        result = run_depreciation(2025, 6, commit=False)
        self.assertFalse(result['committed'])
        self.assertEqual(result['count'], 1)
        self.assertEqual(DepreciationRun.objects.count(), 0)
        self.assertEqual(DepreciationEntry.objects.count(), 0)

    def test_commit_creates_run_and_entries(self):
        AssetFinancial.objects.create(asset=self._asset('A1'))
        AssetFinancial.objects.create(asset=self._asset('A2'))
        result = run_depreciation(2025, 6, user=self.user, commit=True)
        self.assertTrue(result['committed'])
        self.assertEqual(result['count'], 2)
        self.assertEqual(DepreciationRun.objects.count(), 1)
        self.assertEqual(DepreciationEntry.objects.count(), 2)
        # 100000 * 33.33 / 100 / 12 = 2777.50 each
        self.assertEqual(result['total_depreciation'], Decimal('5555.00'))

    def test_idempotent_no_double_post(self):
        AssetFinancial.objects.create(asset=self._asset('A1'))
        run_depreciation(2025, 6, commit=True)
        second = run_depreciation(2025, 6, commit=True)
        self.assertTrue(second['already_posted'])
        self.assertEqual(DepreciationRun.objects.count(), 1)
        self.assertEqual(DepreciationEntry.objects.count(), 1)

    def test_nbv_continuity_across_months(self):
        AssetFinancial.objects.create(asset=self._asset('A1'))
        jan = run_depreciation(2025, 1, commit=True)
        feb = run_depreciation(2025, 2, commit=True)
        jan_close = jan['lines'][0]['closing_nbv']
        feb_open = feb['lines'][0]['opening_nbv']
        self.assertEqual(jan_close, feb_open)
        # Feb depreciation is on the reduced balance, so smaller than Jan
        self.assertLess(feb['lines'][0]['depreciation_amount'], jan['lines'][0]['depreciation_amount'])

    def test_accumulated_depreciation_builds_up(self):
        fin = AssetFinancial.objects.create(asset=self._asset('A1'))
        run_depreciation(2025, 1, commit=True)
        run_depreciation(2025, 2, commit=True)
        latest = fin.latest_entry
        # accumulated == cost - closing_nbv
        self.assertEqual(latest.accumulated_depreciation, Decimal('100000') - latest.closing_nbv)

    def test_opening_accumulated_respected(self):
        # Pre-owned asset already 40000 depreciated -> opening NBV 60000
        fin = AssetFinancial.objects.create(
            asset=self._asset('A1'), opening_accumulated_depreciation=Decimal('40000'),
        )
        result = run_depreciation(2025, 6, commit=True)
        line = result['lines'][0]
        self.assertEqual(line['opening_nbv'], Decimal('60000.00'))
        # 60000 * 33.33 / 100 / 12 = 1666.50
        self.assertEqual(line['depreciation_amount'], Decimal('1666.50'))

    def test_asset_without_purchase_price_skipped(self):
        AssetFinancial.objects.create(asset=self._asset('A1', price=None))
        result = run_depreciation(2025, 6, commit=True)
        self.assertEqual(result['count'], 0)

    def test_asset_without_policy_or_rate_skipped(self):
        other = SuperCategory.objects.create(name='Test Misc', code='test_misc')  # no policy
        asset = Asset.objects.create(
            miczon_id='A9', name='No policy', super_category=other,
            purchase_price=Decimal('100000'), purchase_date=date(2025, 1, 1),
        )
        AssetFinancial.objects.create(asset=asset)
        result = run_depreciation(2025, 6, commit=True)
        self.assertEqual(result['count'], 0)

    def test_per_asset_rate_override(self):
        fin = AssetFinancial.objects.create(
            asset=self._asset('A1'), annual_rate_override=Decimal('12'),
        )
        line = run_depreciation(2025, 6, commit=False)['lines'][0]
        # 100000 * 12 / 100 / 12 = 1000.00
        self.assertEqual(line['depreciation_amount'], Decimal('1000.00'))

    def test_not_in_service_yet_skipped(self):
        AssetFinancial.objects.create(
            asset=self._asset('A1', pdate=date(2025, 8, 1)),
            in_service_date=date(2025, 8, 1),
        )
        # Period June 2025 is before in-service date
        self.assertEqual(run_depreciation(2025, 6, commit=True)['count'], 0)
        # August works
        self.assertEqual(run_depreciation(2025, 8, commit=True)['count'], 1)

    def test_disposed_asset_skipped(self):
        fin = AssetFinancial.objects.create(asset=self._asset('A1'))
        AssetDisposal.objects.create(
            asset_financial=fin, disposal_date=date(2025, 3, 1),
            method='SOLD', proceeds=Decimal('50000'), nbv_at_disposal=Decimal('90000'),
            gain_loss=Decimal('-40000'),
        )
        self.assertEqual(run_depreciation(2025, 6, commit=True)['count'], 0)

    def test_fully_depreciated_asset_stops_getting_entries(self):
        # Salvage equals cost -> nothing to depreciate, no entry created
        fin = AssetFinancial.objects.create(
            asset=self._asset('A1'), salvage_value=Decimal('100000'),
        )
        self.assertEqual(run_depreciation(2025, 6, commit=True)['count'], 0)


class DisposalModelTests(TestCase):
    def test_gain_loss_autocomputed(self):
        sc = SuperCategory.objects.create(name='Test IT', code='test_it')
        asset = Asset.objects.create(
            miczon_id='A1', name='D', super_category=sc,
            purchase_price=Decimal('100000'), purchase_date=date(2025, 1, 1),
        )
        fin = AssetFinancial.objects.create(asset=asset)
        disposal = AssetDisposal(
            asset_financial=fin, disposal_date=date(2025, 6, 1),
            method='SOLD', proceeds=Decimal('70000'), nbv_at_disposal=Decimal('80000'),
        )
        disposal.gain_loss = None
        disposal.save()
        self.assertEqual(disposal.gain_loss, Decimal('-10000.00'))


class AccountsQueryPerformanceTests(TestCase):
    def setUp(self):
        self.user = User.objects.create_user('perf-acct', password='x')
        self.sc = SuperCategory.objects.create(name='Performance IT', code='performance_it')
        DepreciationPolicy.objects.create(
            super_category=self.sc, annual_rate=Decimal('25'), salvage_percent=Decimal('5'),
        )
        run = DepreciationRun.objects.create(period_year=2026, period_month=8, run_by=self.user)
        for index in range(5):
            asset = Asset.objects.create(
                miczon_id=f'PERF-{index}', name=f'Performance asset {index}',
                super_category=self.sc, purchase_price=Decimal('10000'), purchase_date=date(2025, 1, 1),
            )
            financial = AssetFinancial.objects.create(asset=asset)
            DepreciationEntry.objects.create(
                run=run, asset_financial=financial, period_year=2026, period_month=8,
                opening_nbv=Decimal('10000'), depreciation_amount=Decimal('100'),
                accumulated_depreciation=Decimal('100'), closing_nbv=Decimal('9900'),
            )

    def test_financial_list_serialization_uses_one_query(self):
        with self.assertNumQueries(1):
            payload = AssetFinancialSerializer(
                AssetFinancial.objects.with_calculation_context(), many=True,
            ).data
            JSONRenderer().render(payload)
        self.assertEqual(len(payload), 5)

    def test_run_list_totals_use_one_query(self):
        queryset = DepreciationRun.objects.select_related('run_by').annotate(
            entry_count_value=Count('entries'),
            total_depreciation_value=Sum('entries__depreciation_amount'),
        )
        with self.assertNumQueries(1):
            payload = DepreciationRunSerializer(queryset, many=True).data
            JSONRenderer().render(payload)
        self.assertEqual(payload[0]['entry_count'], 5)
