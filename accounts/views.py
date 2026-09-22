from decimal import Decimal

from django.db.models import Count, Q, Sum
from rest_framework import viewsets, permissions, status
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.response import Response
from rest_framework.views import APIView

from inventory.models import Asset
from .models import (
    DepreciationPolicy, AssetFinancial, DepreciationRun,
    DepreciationEntry, AssetDisposal, q2,
)
from .serializers import (
    DepreciationPolicySerializer, AssetFinancialSerializer, DepreciationRunSerializer,
    DepreciationEntrySerializer, AssetDisposalSerializer,
)
from .services import run_depreciation, period_end_date


class AccountsPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 200


class NotStockOnlyUser(permissions.BasePermission):
    """Denies access to stock-only users for financial accounts."""
    message = "Access restricted to stock management."

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        return not user.groups.filter(name='Stock Only').exists()


class IsAdminUserOrReadOnly(permissions.BasePermission):
    """Any authenticated non-stock user may read; only superusers may write."""
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if not request.user.is_superuser and request.user.groups.filter(name='Stock Only').exists():
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user.is_superuser)


class DepreciationPolicyViewSet(viewsets.ModelViewSet):
    queryset = DepreciationPolicy.objects.select_related('super_category').all()
    serializer_class = DepreciationPolicySerializer
    permission_classes = [IsAdminUserOrReadOnly]


class AssetFinancialViewSet(viewsets.ModelViewSet):
    serializer_class = AssetFinancialSerializer
    permission_classes = [IsAdminUserOrReadOnly]
    pagination_class = AccountsPagination

    def get_queryset(self):
        qs = AssetFinancial.objects.with_calculation_context()
        params = self.request.query_params
        search = params.get('search')
        if search:
            qs = qs.filter(Q(asset__miczon_id__icontains=search) | Q(asset__name__icontains=search))
        department = params.get('department')
        if department:
            qs = qs.filter(asset__department_id=department)
        super_category = params.get('super_category')
        if super_category:
            qs = qs.filter(asset__super_category__code=super_category)
        return qs

    @action(detail=False, methods=['post'], url_path='bulk-init')
    def bulk_init(self, request):
        """Create AssetFinancial rows for every asset that has purchase data but no financial yet."""
        if not request.user.is_superuser:
            return Response({"error": "Admins only."}, status=403)
        existing = set(AssetFinancial.objects.values_list('asset_id', flat=True))
        to_create = [
            AssetFinancial(asset=a)
            for a in Asset.objects.filter(purchase_price__isnull=False).exclude(id__in=existing)
        ]
        AssetFinancial.objects.bulk_create(to_create)
        return Response({"created": len(to_create)}, status=201)


class DepreciationRunViewSet(viewsets.ModelViewSet):
    """List/retrieve runs; POST to commit a month; POST /preview/ for a dry-run."""
    queryset = DepreciationRun.objects.select_related('run_by').annotate(
        entry_count_value=Count('entries'),
        total_depreciation_value=Sum('entries__depreciation_amount'),
    )
    serializer_class = DepreciationRunSerializer
    permission_classes = [IsAdminUserOrReadOnly]
    http_method_names = ['get', 'post', 'head', 'options']

    @action(detail=False, methods=['post'], url_path='preview')
    def preview(self, request):
        year, month, err = _parse_period(request.data)
        if err:
            return Response({"error": err}, status=400)
        result = run_depreciation(year, month, user=request.user, commit=False)
        return Response(result)

    def create(self, request, *args, **kwargs):
        if not request.user.is_superuser:
            return Response({"error": "Admins only."}, status=403)
        year, month, err = _parse_period(request.data)
        if err:
            return Response({"error": err}, status=400)
        result = run_depreciation(year, month, user=request.user, commit=True)
        if result['already_posted']:
            return Response(
                {"error": f"{year}-{month:02d} is already posted (run #{result['run_id']})."},
                status=409,
            )
        if result['count'] == 0:
            return Response(
                {"error": "No eligible assets to depreciate for this period.", **result},
                status=400,
            )
        return Response(result, status=201)


class DepreciationEntryViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = DepreciationEntrySerializer
    permission_classes = [permissions.IsAuthenticated, NotStockOnlyUser]

    def get_queryset(self):
        qs = (
            DepreciationEntry.objects
            .select_related('asset_financial__asset', 'asset_financial__asset__department')
        )
        params = self.request.query_params
        if params.get('year'):
            qs = qs.filter(period_year=params['year'])
        if params.get('month'):
            qs = qs.filter(period_month=params['month'])
        if params.get('department'):
            qs = qs.filter(asset_financial__asset__department_id=params['department'])
        if params.get('asset_financial'):
            qs = qs.filter(asset_financial_id=params['asset_financial'])
        return qs


class AssetDisposalViewSet(viewsets.ModelViewSet):
    queryset = AssetDisposal.objects.select_related('asset_financial__asset').all()
    serializer_class = AssetDisposalSerializer
    permission_classes = [IsAdminUserOrReadOnly]

    def perform_create(self, serializer):
        financial = serializer.validated_data['asset_financial']
        nbv = financial.current_nbv or Decimal('0.00')
        proceeds = serializer.validated_data.get('proceeds') or Decimal('0.00')
        serializer.save(nbv_at_disposal=q2(nbv), gain_loss=q2(proceeds - nbv))


def _parse_period(data):
    try:
        year = int(data.get('year'))
        month = int(data.get('month'))
    except (TypeError, ValueError):
        return None, None, "year and month are required integers."
    if not (1 <= month <= 12):
        return None, None, "month must be between 1 and 12."
    return year, month, None


# --- Reports ---
class ReportsView(APIView):
    permission_classes = [permissions.IsAuthenticated, NotStockOnlyUser]

    def get(self, request, report=None):
        if report == 'register':
            return self._register(request)
        if report == 'nbv-summary':
            return self._nbv_summary(request)
        if report == 'monthly-expense':
            return self._monthly_expense(request)
        return Response({"error": "Unknown report."}, status=404)

    def _register(self, request):
        """Per-asset: cost, accumulated depreciation, net book value (current)."""
        rows = []
        totals = {'cost': Decimal('0'), 'accumulated': Decimal('0'), 'nbv': Decimal('0')}
        qs = AssetFinancial.objects.with_calculation_context()
        for fin in qs:
            if fin.cost is None:
                continue
            cost = q2(fin.cost)
            acc = q2(fin.accumulated_depreciation)
            nbv = q2(fin.current_nbv)
            rows.append({
                'financial_id': fin.id,
                'asset_id': fin.asset_id,
                'miczon_id': fin.asset.miczon_id,
                'name': fin.asset.name,
                'department': fin.asset.department.name if fin.asset.department else None,
                'category': fin.asset.super_category.name if fin.asset.super_category else None,
                'cost': cost,
                'annual_rate': fin.effective_rate,
                'accumulated_depreciation': acc,
                'net_book_value': nbv,
                'is_disposed': fin.is_disposed,
            })
            totals['cost'] += cost
            totals['accumulated'] += acc
            totals['nbv'] += nbv
        return Response({
            'count': len(rows),
            'totals': {k: q2(v) for k, v in totals.items()},
            'rows': rows,
        })

    def _nbv_summary(self, request):
        """Current NBV grouped by department or category."""
        group_by = request.query_params.get('group_by', 'department')
        buckets = {}
        qs = AssetFinancial.objects.with_calculation_context()
        for fin in qs:
            if fin.cost is None:
                continue
            if group_by == 'category':
                key = fin.asset.super_category.name if fin.asset.super_category else 'Uncategorized'
            else:
                key = fin.asset.department.name if fin.asset.department else 'No department'
            b = buckets.setdefault(key, {'group': key, 'count': 0, 'cost': Decimal('0'),
                                         'accumulated_depreciation': Decimal('0'), 'net_book_value': Decimal('0')})
            b['count'] += 1
            b['cost'] += q2(fin.cost)
            b['accumulated_depreciation'] += q2(fin.accumulated_depreciation)
            b['net_book_value'] += q2(fin.current_nbv)
        rows = sorted(buckets.values(), key=lambda r: r['group'])
        for r in rows:
            for k in ('cost', 'accumulated_depreciation', 'net_book_value'):
                r[k] = q2(r[k])
        return Response({'group_by': group_by, 'rows': rows})

    def _monthly_expense(self, request):
        """Total depreciation expense per month for a given year (default: all years)."""
        qs = DepreciationEntry.objects.all()
        year = request.query_params.get('year')
        if year:
            qs = qs.filter(period_year=year)
        agg = (
            qs.values('period_year', 'period_month')
              .annotate(total=Sum('depreciation_amount'))
              .order_by('period_year', 'period_month')
        )
        rows = [
            {'year': r['period_year'], 'month': r['period_month'], 'total': q2(r['total'])}
            for r in agg
        ]
        return Response({'rows': rows, 'grand_total': q2(sum((r['total'] for r in rows), Decimal('0')))})
