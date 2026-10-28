from django.db.models import Sum
from rest_framework import serializers

from .models import (
    DepreciationPolicy, AssetFinancial, DepreciationRun,
    DepreciationEntry, AssetDisposal,
)


class DepreciationPolicySerializer(serializers.ModelSerializer):
    super_category_name = serializers.CharField(source='super_category.name', read_only=True)
    super_category_code = serializers.CharField(source='super_category.code', read_only=True)

    class Meta:
        model = DepreciationPolicy
        fields = [
            'id', 'super_category', 'super_category_name', 'super_category_code',
            'annual_rate', 'salvage_percent', 'is_active', 'created_at', 'updated_at',
        ]


class AssetFinancialSerializer(serializers.ModelSerializer):
    miczon_id = serializers.CharField(source='asset.miczon_id', read_only=True)
    asset_name = serializers.CharField(source='asset.name', read_only=True)
    super_category_name = serializers.CharField(source='asset.super_category.name', read_only=True)
    department_name = serializers.CharField(source='asset.department.name', read_only=True)

    # Derived, read-only
    cost = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    start_date = serializers.DateField(read_only=True)
    effective_rate = serializers.DecimalField(max_digits=5, decimal_places=2, read_only=True)
    effective_salvage = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    accumulated_depreciation = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    current_nbv = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    is_ready = serializers.BooleanField(read_only=True)
    is_disposed = serializers.BooleanField(read_only=True)

    class Meta:
        model = AssetFinancial
        fields = [
            'id', 'asset', 'miczon_id', 'asset_name', 'super_category_name', 'department_name',
            'in_service_date', 'salvage_value', 'annual_rate_override', 'is_depreciable',
            'opening_accumulated_depreciation',
            'cost', 'start_date', 'effective_rate', 'effective_salvage',
            'accumulated_depreciation', 'current_nbv', 'is_ready', 'is_disposed',
            'created_at', 'updated_at',
        ]


class DepreciationEntrySerializer(serializers.ModelSerializer):
    miczon_id = serializers.CharField(source='asset_financial.asset.miczon_id', read_only=True)
    asset_name = serializers.CharField(source='asset_financial.asset.name', read_only=True)
    department_name = serializers.CharField(source='asset_financial.asset.department.name', read_only=True)

    class Meta:
        model = DepreciationEntry
        fields = [
            'id', 'run', 'asset_financial', 'miczon_id', 'asset_name', 'department_name',
            'period_year', 'period_month',
            'opening_nbv', 'depreciation_amount', 'accumulated_depreciation', 'closing_nbv',
            'created_at',
        ]


class DepreciationRunSerializer(serializers.ModelSerializer):
    run_by_name = serializers.CharField(source='run_by.username', read_only=True)
    entry_count = serializers.SerializerMethodField()
    total_depreciation = serializers.SerializerMethodField()

    class Meta:
        model = DepreciationRun
        fields = [
            'id', 'period_year', 'period_month', 'status', 'run_by', 'run_by_name',
            'notes', 'created_at', 'posted_at', 'entry_count', 'total_depreciation',
        ]

    def get_entry_count(self, obj):
        if hasattr(obj, 'entry_count_value'):
            return obj.entry_count_value
        return obj.entries.count()

    def get_total_depreciation(self, obj):
        if hasattr(obj, 'total_depreciation_value'):
            return obj.total_depreciation_value or 0
        return obj.entries.aggregate(t=Sum('depreciation_amount'))['t'] or 0


class AssetDisposalSerializer(serializers.ModelSerializer):
    miczon_id = serializers.CharField(source='asset_financial.asset.miczon_id', read_only=True)
    asset_name = serializers.CharField(source='asset_financial.asset.name', read_only=True)

    class Meta:
        model = AssetDisposal
        fields = [
            'id', 'asset_financial', 'miczon_id', 'asset_name',
            'disposal_date', 'method', 'proceeds',
            'nbv_at_disposal', 'gain_loss', 'notes', 'created_at',
        ]
        # nbv_at_disposal + gain_loss are computed server-side from current NBV.
        read_only_fields = ['nbv_at_disposal', 'gain_loss']
