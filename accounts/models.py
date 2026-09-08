from decimal import Decimal, ROUND_HALF_UP
from django.db import models
from django.utils import timezone

TWO_PLACES = Decimal('0.01')


def q2(value):
    """Quantize a Decimal-like value to 2 places (PKR)."""
    if value is None:
        return None
    return Decimal(value).quantize(TWO_PLACES, rounding=ROUND_HALF_UP)


class DepreciationPolicy(models.Model):
    """Default depreciation settings for a whole SuperCategory (e.g. IT Assets, Furniture)."""
    super_category = models.OneToOneField(
        'inventory.SuperCategory', on_delete=models.CASCADE, related_name='depreciation_policy'
    )
    annual_rate = models.DecimalField(
        max_digits=5, decimal_places=2, help_text="Annual WDV rate as a percentage, e.g. 33.33"
    )
    salvage_percent = models.DecimalField(
        max_digits=5, decimal_places=2, default=Decimal('0'),
        help_text="Default salvage/residual value as a percentage of purchase cost."
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "Depreciation Policies"
        ordering = ['super_category__name']

    def __str__(self):
        return f"{self.super_category.name} @ {self.annual_rate}%/yr"


class AssetFinancialQuerySet(models.QuerySet):
    def with_calculation_context(self):
        latest_entry = DepreciationEntry.objects.filter(
            asset_financial_id=models.OuterRef('pk')
        ).order_by('-period_year', '-period_month', '-pk')
        return self.select_related(
            'asset', 'asset__department', 'asset__super_category',
            'asset__super_category__depreciation_policy', 'disposal',
        ).annotate(
            latest_accumulated_value=models.Subquery(
                latest_entry.values('accumulated_depreciation')[:1],
                output_field=models.DecimalField(max_digits=12, decimal_places=2),
            ),
            latest_closing_value=models.Subquery(
                latest_entry.values('closing_nbv')[:1],
                output_field=models.DecimalField(max_digits=12, decimal_places=2),
            ),
        )


class AssetFinancial(models.Model):
    """The accounting layer for one asset. Acquisition cost/date live on inventory.Asset."""
    asset = models.OneToOneField(
        'inventory.Asset', on_delete=models.CASCADE, related_name='financial'
    )
    in_service_date = models.DateField(
        null=True, blank=True,
        help_text="Date depreciation starts. Defaults to the asset's purchase date."
    )
    salvage_value = models.DecimalField(
        max_digits=12, decimal_places=2, null=True, blank=True,
        help_text="Residual value floor. If blank, derived from the category policy's salvage %."
    )
    annual_rate_override = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True,
        help_text="Per-asset annual WDV rate. If blank, the category policy rate is used."
    )
    is_depreciable = models.BooleanField(default=True)
    opening_accumulated_depreciation = models.DecimalField(
        max_digits=12, decimal_places=2, default=Decimal('0'),
        help_text="Accumulated depreciation already booked before go-live (for pre-owned assets)."
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    objects = AssetFinancialQuerySet.as_manager()

    class Meta:
        ordering = ['asset__miczon_id']

    def __str__(self):
        return f"Financials: {self.asset.miczon_id}"

    # --- Derived values (not stored) ---
    @property
    def cost(self):
        """Acquisition cost — the source of truth is Asset.purchase_price."""
        return self.asset.purchase_price

    @property
    def start_date(self):
        return self.in_service_date or self.asset.purchase_date

    @property
    def _policy(self):
        sc = self.asset.super_category
        if not sc:
            return None
        return getattr(sc, 'depreciation_policy', None)

    @property
    def effective_rate(self):
        """Annual WDV rate (%): per-asset override, else the category policy."""
        if self.annual_rate_override is not None:
            return self.annual_rate_override
        policy = self._policy
        if policy and policy.is_active:
            return policy.annual_rate
        return None

    @property
    def effective_salvage(self):
        """Salvage value: explicit per-asset value, else policy salvage_percent × cost."""
        if self.salvage_value is not None:
            return self.salvage_value
        policy = self._policy
        if policy and self.cost is not None:
            return q2(self.cost * policy.salvage_percent / Decimal('100'))
        return Decimal('0.00')

    @property
    def is_disposed(self):
        return hasattr(self, 'disposal')

    @property
    def is_ready(self):
        """True when this asset can be depreciated (has cost, start date, rate, not disposed)."""
        return bool(
            self.is_depreciable
            and not self.is_disposed
            and self.cost is not None
            and self.start_date is not None
            and self.effective_rate is not None
        )

    @property
    def latest_entry(self):
        return self.depreciation_entries.order_by('-period_year', '-period_month').first()

    @property
    def accumulated_depreciation(self):
        if hasattr(self, 'latest_accumulated_value'):
            return self.latest_accumulated_value if self.latest_accumulated_value is not None else q2(self.opening_accumulated_depreciation)
        latest = self.latest_entry
        if latest:
            return latest.accumulated_depreciation
        return q2(self.opening_accumulated_depreciation)

    @property
    def current_nbv(self):
        """Net book value = cost − accumulated depreciation."""
        if self.cost is None:
            return None
        if hasattr(self, 'latest_closing_value'):
            return self.latest_closing_value if self.latest_closing_value is not None else q2(self.cost - self.opening_accumulated_depreciation)
        latest = self.latest_entry
        if latest:
            return latest.closing_nbv
        return q2(self.cost - self.opening_accumulated_depreciation)


class DepreciationRun(models.Model):
    """One monthly depreciation batch. A row exists once a month has been posted."""
    STATUS_CHOICES = [
        ('DRAFT', 'Draft'),
        ('POSTED', 'Posted'),
    ]
    period_year = models.PositiveIntegerField()
    period_month = models.PositiveSmallIntegerField()
    status = models.CharField(max_length=10, choices=STATUS_CHOICES, default='POSTED')
    run_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True)
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    posted_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        unique_together = ('period_year', 'period_month')
        ordering = ['-period_year', '-period_month']

    def __str__(self):
        return f"Depreciation {self.period_year}-{self.period_month:02d} ({self.status})"

    def save(self, *args, **kwargs):
        if self.status == 'POSTED' and self.posted_at is None:
            self.posted_at = timezone.now()
        super().save(*args, **kwargs)


class DepreciationEntry(models.Model):
    """Immutable ledger row: one asset's depreciation for one posted month."""
    run = models.ForeignKey(DepreciationRun, on_delete=models.CASCADE, related_name='entries')
    asset_financial = models.ForeignKey(
        AssetFinancial, on_delete=models.CASCADE, related_name='depreciation_entries'
    )
    period_year = models.PositiveIntegerField()
    period_month = models.PositiveSmallIntegerField()

    opening_nbv = models.DecimalField(max_digits=12, decimal_places=2)
    depreciation_amount = models.DecimalField(max_digits=12, decimal_places=2)
    accumulated_depreciation = models.DecimalField(max_digits=12, decimal_places=2)
    closing_nbv = models.DecimalField(max_digits=12, decimal_places=2)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "Depreciation Entries"
        unique_together = ('asset_financial', 'period_year', 'period_month')
        ordering = ['-period_year', '-period_month', 'asset_financial__asset__miczon_id']
        indexes = [
            models.Index(fields=['period_year', 'period_month']),
        ]

    def __str__(self):
        return f"{self.asset_financial.asset.miczon_id} {self.period_year}-{self.period_month:02d}: -{self.depreciation_amount}"


class AssetDisposal(models.Model):
    """Sale / scrap / write-off of an asset, with gain or loss vs. net book value."""
    METHOD_CHOICES = [
        ('SOLD', 'Sold'),
        ('SCRAPPED', 'Scrapped'),
        ('LOST', 'Lost'),
        ('WRITTEN_OFF', 'Written Off'),
    ]
    asset_financial = models.OneToOneField(
        AssetFinancial, on_delete=models.CASCADE, related_name='disposal'
    )
    disposal_date = models.DateField()
    method = models.CharField(max_length=20, choices=METHOD_CHOICES, default='SOLD')
    proceeds = models.DecimalField(max_digits=12, decimal_places=2, default=Decimal('0'))
    nbv_at_disposal = models.DecimalField(max_digits=12, decimal_places=2)
    gain_loss = models.DecimalField(
        max_digits=12, decimal_places=2, help_text="Proceeds − NBV at disposal (positive = gain)."
    )
    notes = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-disposal_date']

    def __str__(self):
        return f"{self.asset_financial.asset.miczon_id} {self.method} on {self.disposal_date}"

    def save(self, *args, **kwargs):
        if self.gain_loss is None:
            self.gain_loss = q2((self.proceeds or Decimal('0')) - (self.nbv_at_disposal or Decimal('0')))
        super().save(*args, **kwargs)
