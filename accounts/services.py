"""
Depreciation engine.

Method: reducing balance (WDV), posted monthly, simple pro-rata
(monthly charge = NBV x annual_rate / 12), never depreciating below salvage.
"""
from calendar import monthrange
from datetime import date
from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from .models import (
    AssetFinancial, DepreciationRun, DepreciationEntry, q2,
)


def compute_monthly_wdv(opening_nbv, annual_rate_percent, salvage_value):
    """
    One month's reducing-balance depreciation.

        raw = opening_nbv * (annual_rate% / 100) / 12
        result = clamp(raw, 0 .. opening_nbv - salvage_value)

    Returns a Decimal rounded to 2 places. Never takes NBV below salvage.
    """
    opening_nbv = Decimal(opening_nbv)
    rate = Decimal(annual_rate_percent)
    salvage = Decimal(salvage_value or 0)

    remaining = opening_nbv - salvage
    if remaining <= 0:
        return Decimal('0.00')

    raw = opening_nbv * rate / Decimal('100') / Decimal('12')
    if raw < 0:
        raw = Decimal('0')
    if raw > remaining:
        raw = remaining
    return q2(raw)


def period_end_date(year, month):
    return date(year, month, monthrange(year, month)[1])


def _prior_state(financial):
    """Opening NBV and accumulated depreciation carried into the next month."""
    if hasattr(financial, 'latest_closing_value'):
        if financial.latest_closing_value is not None:
            return financial.latest_closing_value, financial.latest_accumulated_value
        cost = financial.cost
        opening_acc = q2(financial.opening_accumulated_depreciation)
        return q2(cost - opening_acc), opening_acc
    latest = financial.latest_entry
    if latest:
        return latest.closing_nbv, latest.accumulated_depreciation
    cost = financial.cost
    opening_acc = q2(financial.opening_accumulated_depreciation)
    return q2(cost - opening_acc), opening_acc


def _eligible_financials():
    return (
        AssetFinancial.objects
        .filter(is_depreciable=True, asset__purchase_price__isnull=False)
        .with_calculation_context()
    )


def run_depreciation(year, month, user=None, commit=False):
    """
    Build (and optionally post) the depreciation entries for one month.

    Returns a summary dict:
        { year, month, committed, already_posted, count, total_depreciation, run_id, lines: [...] }
    where each line is a dict describing one asset's proposed/posted entry.

    Idempotent: a month that is already posted is never posted again.
    """
    year = int(year)
    month = int(month)
    if not (1 <= month <= 12):
        raise ValueError("month must be between 1 and 12")

    existing_run = DepreciationRun.objects.filter(period_year=year, period_month=month).first()
    if existing_run:
        entries = existing_run.entries.select_related('asset_financial__asset')
        lines = [_entry_to_line(e.asset_financial, e.opening_nbv, e.depreciation_amount,
                                e.accumulated_depreciation, e.closing_nbv) for e in entries]
        return {
            'year': year, 'month': month, 'committed': False, 'already_posted': True,
            'count': len(lines),
            'total_depreciation': q2(sum((l['depreciation_amount'] for l in lines), Decimal('0'))),
            'run_id': existing_run.id, 'lines': lines,
        }

    p_end = period_end_date(year, month)
    lines = []

    financials = list(_eligible_financials())
    existing_financial_ids = set(DepreciationEntry.objects.filter(
        period_year=year,
        period_month=month,
        asset_financial_id__in=[financial.pk for financial in financials],
    ).values_list('asset_financial_id', flat=True))

    for fin in financials:
        if not fin.is_ready:
            continue
        if fin.start_date is None or fin.start_date > p_end:
            continue  # not yet in service this period
        # Skip if an entry somehow already exists for this asset+period (defensive)
        if fin.pk in existing_financial_ids:
            continue

        opening_nbv, opening_acc = _prior_state(fin)
        amount = compute_monthly_wdv(opening_nbv, fin.effective_rate, fin.effective_salvage)
        if amount <= 0:
            continue  # fully depreciated to salvage — nothing more to book

        accumulated = q2(opening_acc + amount)
        closing = q2(opening_nbv - amount)
        lines.append(_entry_to_line(fin, opening_nbv, amount, accumulated, closing))

    total = q2(sum((l['depreciation_amount'] for l in lines), Decimal('0')))

    result = {
        'year': year, 'month': month, 'committed': False, 'already_posted': False,
        'count': len(lines), 'total_depreciation': total, 'run_id': None, 'lines': lines,
    }

    if commit and lines:
        with transaction.atomic():
            run = DepreciationRun.objects.create(
                period_year=year, period_month=month, status='POSTED',
                run_by=user, posted_at=timezone.now(),
            )
            DepreciationEntry.objects.bulk_create([
                DepreciationEntry(
                    run=run,
                    asset_financial_id=l['financial_id'],
                    period_year=year, period_month=month,
                    opening_nbv=l['opening_nbv'],
                    depreciation_amount=l['depreciation_amount'],
                    accumulated_depreciation=l['accumulated_depreciation'],
                    closing_nbv=l['closing_nbv'],
                )
                for l in lines
            ])
        result['committed'] = True
        result['run_id'] = run.id

    return result


def _entry_to_line(financial, opening_nbv, amount, accumulated, closing):
    return {
        'financial_id': financial.id,
        'asset_id': financial.asset_id,
        'miczon_id': financial.asset.miczon_id,
        'opening_nbv': q2(opening_nbv),
        'depreciation_amount': q2(amount),
        'accumulated_depreciation': q2(accumulated),
        'closing_nbv': q2(closing),
    }
