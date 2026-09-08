from django.contrib import admin
from .models import (
    DepreciationPolicy, AssetFinancial, DepreciationRun,
    DepreciationEntry, AssetDisposal,
)


@admin.register(DepreciationPolicy)
class DepreciationPolicyAdmin(admin.ModelAdmin):
    list_display = ('super_category', 'annual_rate', 'salvage_percent', 'is_active')
    list_filter = ('is_active',)
    search_fields = ('super_category__name',)


@admin.register(AssetFinancial)
class AssetFinancialAdmin(admin.ModelAdmin):
    list_display = (
        'asset', 'cost', 'in_service_date', 'effective_rate',
        'effective_salvage', 'current_nbv', 'is_depreciable', 'is_ready',
    )
    list_filter = ('is_depreciable',)
    search_fields = ('asset__miczon_id', 'asset__name')
    raw_id_fields = ('asset',)
    readonly_fields = ('cost', 'effective_rate', 'effective_salvage', 'current_nbv', 'is_ready')

    @admin.display(description='Cost')
    def cost(self, obj):
        return obj.cost

    @admin.display(description='Rate %')
    def effective_rate(self, obj):
        return obj.effective_rate

    @admin.display(description='Salvage')
    def effective_salvage(self, obj):
        return obj.effective_salvage

    @admin.display(description='NBV')
    def current_nbv(self, obj):
        return obj.current_nbv

    @admin.display(boolean=True, description='Ready')
    def is_ready(self, obj):
        return obj.is_ready


class DepreciationEntryInline(admin.TabularInline):
    model = DepreciationEntry
    extra = 0
    can_delete = False
    readonly_fields = (
        'asset_financial', 'opening_nbv', 'depreciation_amount',
        'accumulated_depreciation', 'closing_nbv',
    )

    def has_add_permission(self, request, obj=None):
        return False


@admin.register(DepreciationRun)
class DepreciationRunAdmin(admin.ModelAdmin):
    list_display = ('period_year', 'period_month', 'status', 'run_by', 'posted_at', 'entry_count')
    list_filter = ('status', 'period_year')
    inlines = [DepreciationEntryInline]

    @admin.display(description='Entries')
    def entry_count(self, obj):
        return obj.entries.count()


@admin.register(DepreciationEntry)
class DepreciationEntryAdmin(admin.ModelAdmin):
    list_display = (
        'asset_financial', 'period_year', 'period_month',
        'opening_nbv', 'depreciation_amount', 'accumulated_depreciation', 'closing_nbv',
    )
    list_filter = ('period_year', 'period_month')
    search_fields = ('asset_financial__asset__miczon_id',)
    readonly_fields = (
        'run', 'asset_financial', 'period_year', 'period_month',
        'opening_nbv', 'depreciation_amount', 'accumulated_depreciation', 'closing_nbv',
    )

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False


@admin.register(AssetDisposal)
class AssetDisposalAdmin(admin.ModelAdmin):
    list_display = ('asset_financial', 'disposal_date', 'method', 'proceeds', 'nbv_at_disposal', 'gain_loss')
    list_filter = ('method', 'disposal_date')
    search_fields = ('asset_financial__asset__miczon_id',)
