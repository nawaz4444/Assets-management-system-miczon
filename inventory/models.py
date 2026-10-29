from django.db import models, transaction
from django.utils import timezone
from datetime import date

class SuperCategory(models.Model):
    name = models.CharField(max_length=100, unique=True)
    code = models.SlugField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        verbose_name_plural = "Super Categories"
        ordering = ['id']

    def __str__(self):
        return self.name

class Department(models.Model):
    name = models.CharField(max_length=100, unique=True)
    floor = models.CharField(max_length=50, blank=True, null=True)
    manager = models.ForeignKey('Employee', on_delete=models.SET_NULL, null=True, blank=True, related_name='managed_departments')
    def __str__(self): return self.name

class Employee(models.Model):
    user = models.OneToOneField('auth.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='employee_profile')
    name = models.CharField(max_length=100)
    employee_id = models.CharField(max_length=50, unique=True)
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True)
    email = models.EmailField(blank=True)
    def __str__(self): return f"{self.name} ({self.employee_id})"

class Asset(models.Model):
    STATUS_CHOICES = [
        ('AVAILABLE', 'Available'),
        ('ASSIGNED', 'Assigned'),
        ('BROKEN', 'Broken/Repair'),
    ]

    # --- COLUMNS MATCHING YOUR EXCEL FILE ---
    miczon_id = models.CharField(max_length=50, unique=True, verbose_name="Miczon ID")
    name = models.CharField(max_length=100, verbose_name="Device Name")
    super_category = models.ForeignKey(SuperCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='assets')
    category = models.CharField(max_length=100, blank=True, verbose_name="Categary")
    specifications = models.TextField(blank=True)
    
    # Relationships
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True)
    custodian = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name='assets')
    
    # Acquisition / Financial (shown in inventory)
    purchase_date = models.DateField(null=True, blank=True, verbose_name="Purchase Date")
    purchase_price = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True, verbose_name="Purchase Price (PKR)")

    # Status & Audit
    current_status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='AVAILABLE')
    remarks = models.TextField(blank=True)
    last_inspection_date = models.DateField(null=True, blank=True)
    
    # Repair/Maintenance Fields
    maintenance_vendor = models.CharField(max_length=255, blank=True)
    sent_to_repair_date = models.DateField(null=True, blank=True)
    expected_return_date = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    def save(self, *args, **kwargs):
        # Keep every write path (including imports/admin) consistent with the ledger.
        with transaction.atomic():
            if self.pk:
                type(self).objects.select_for_update().filter(pk=self.pk).exists()
            if self.current_status == 'BROKEN':
                self.custodian = None
            elif self.custodian_id:
                self.current_status = 'ASSIGNED'
            elif self.current_status == 'ASSIGNED':
                self.current_status = 'AVAILABLE'
            if kwargs.get('update_fields'):
                kwargs['update_fields'] = set(kwargs['update_fields']) | {'custodian', 'current_status'}
            super().save(*args, **kwargs)
            active = self.assignments.filter(status='ASSIGNED')
            retained = active.filter(employee_id=self.custodian_id).first() if self.custodian_id else None
            active.exclude(pk=retained.pk if retained else None).update(
                status='RETURNED', returned_date=date.today(), returned_by='Asset update',
                condition='Broken' if self.current_status == 'BROKEN' else 'Good',
            )
            if self.custodian_id and not retained:
                AssetAssignment.objects.create(asset=self, employee=self.custodian)

    @property
    def is_overdue_repair(self):
        if self.current_status == 'BROKEN' and self.expected_return_date:
            return date.today() > self.expected_return_date
        return False

    def __str__(self):
        return f"{self.name} ({self.miczon_id})"

# --- HISTORY & LOGS ---
class AssetHistory(models.Model):
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name='history')
    action = models.CharField(max_length=50)
    from_employee = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, related_name='assets_given')
    to_employee = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, related_name='assets_received')
    date = models.DateTimeField(auto_now_add=True)
    remarks = models.TextField(blank=True)

class InspectionLog(models.Model):
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE)
    date = models.DateField(auto_now_add=True)
    status_found = models.CharField(max_length=50, default='OK')
    inspector_name = models.CharField(max_length=100, default='Admin')
    notes = models.TextField(blank=True)

class HealthCheckSession(models.Model):
    STATUS_CHOICES = [
        ('OPEN', 'Open'),
        ('CLOSED', 'Closed'),
    ]

    title = models.CharField(max_length=150, default='Monthly Hardware Inspection')
    super_category = models.ForeignKey(SuperCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='health_sessions')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='OPEN')
    triggered_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    targets_snapshot = models.JSONField(null=True, blank=True, editable=False)

    def save(self, *args, **kwargs):
        if self._state.adding and self.targets_snapshot is None:
            from .services import snapshot_targets
            self.targets_snapshot = snapshot_targets(self.super_category_id)
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.title} ({self.created_at:%Y-%m-%d})"

class HealthCheckResponse(models.Model):
    SCREEN_CHOICES = [
        ('EXCELLENT', 'Excellent'),
        ('GOOD', 'Good'),
        ('SCRATCHED', 'Scratched'),
        ('CRACKED', 'Cracked'),
        ('NEEDS_REPAIR', 'Needs Repair'),
        ('NOT_APPLICABLE', 'Not Applicable (N/A)'),
    ]
    BATTERY_CHOICES = [
        ('EXCELLENT', 'Excellent'),
        ('GOOD', 'Good'),
        ('FAIR', 'Fair'),
        ('POOR', 'Poor'),
        ('NOT_APPLICABLE', 'Not Applicable (N/A)'),
    ]
    PHYSICAL_CONDITION_CHOICES = [
        ('EXCELLENT', 'Excellent'),
        ('GOOD_MINOR_WEAR', 'Good (Minor wear)'),
        ('FAIR_SCRATCHES_DENTS', 'Fair (Noticeable scratches/dents)'),
        ('POOR_CRACKED_BROKEN', 'Poor (Cracked/Broken)'),
    ]
    POWER_BOOT_STATUS_CHOICES = [
        ('BOOTS_NORMALLY', 'Boots normally'),
        ('SLOW_TO_BOOT', 'Slow to boot'),
        ('POWERS_NO_DISPLAY_OS', 'Powers on but no display/OS'),
        ('DOES_NOT_POWER_ON', 'Does not power on'),
    ]
    PORTS_CONNECTORS_CHOICES = [
        ('ALL_FUNCTIONAL', 'All functional'),
        ('LOOSE_CONNECTIONS', 'Loose connections'),
        ('VISIBLY_DAMAGED', 'Visibly damaged'),
        ('UNRESPONSIVE', 'Unresponsive'),
    ]
    NETWORK_FUNCTIONALITY_CHOICES = [
        ('CONNECTS_NORMALLY', 'Connects normally'),
        ('INTERMITTENT_CONNECTION', 'Intermittent connection'),
        ('FAILS_TO_CONNECT', 'Fails to connect'),
    ]
    ASSET_TAG_STATUS_CHOICES = [
        ('INTACT_SCANNABLE', 'Intact & Scannable'),
        ('FADED_PEELING', 'Faded/Peeling'),
        ('MISSING', 'Missing'),
    ]

    session = models.ForeignKey(HealthCheckSession, on_delete=models.CASCADE, related_name='responses')
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='health_check_responses')
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name='health_trail')

    # IT Assets inspection fields
    screen_condition = models.CharField(max_length=50, blank=True, null=True, choices=SCREEN_CHOICES)
    battery_life = models.CharField(max_length=50, blank=True, null=True, choices=BATTERY_CHOICES)
    physical_condition = models.CharField(max_length=50, blank=True, null=True, choices=PHYSICAL_CONDITION_CHOICES, default='GOOD_MINOR_WEAR')
    power_boot_status = models.CharField(max_length=50, blank=True, null=True, choices=POWER_BOOT_STATUS_CHOICES, default='BOOTS_NORMALLY')
    ports_connectors = models.CharField(max_length=50, blank=True, null=True, choices=PORTS_CONNECTORS_CHOICES, default='ALL_FUNCTIONAL')
    network_functionality = models.CharField(max_length=50, blank=True, null=True, choices=NETWORK_FUNCTIONALITY_CHOICES, default='CONNECTS_NORMALLY')

    # Furniture inspection fields
    surface_finish = models.CharField(max_length=50, blank=True, null=True, default='EXCELLENT')
    structural_stability = models.CharField(max_length=50, blank=True, null=True, default='SOLID_STABLE')
    drawers_locks = models.CharField(max_length=50, blank=True, null=True, default='SMOOTH_FUNCTIONAL')
    upholstery_padding = models.CharField(max_length=50, blank=True, null=True, default='INTACT_CLEAN')
    legs_castors_base = models.CharField(max_length=50, blank=True, null=True, default='ALL_INTACT')
    ergonomic_adjustment = models.CharField(max_length=50, blank=True, null=True, default='SMOOTH_MECHANISM')

    # Appliances inspection fields
    cooling_heating_perf = models.CharField(max_length=50, blank=True, null=True, default='OPTIMAL_TEMP')
    compressor_motor_status = models.CharField(max_length=50, blank=True, null=True, default='QUIET_SMOOTH')
    power_cord_plug = models.CharField(max_length=50, blank=True, null=True, default='INTACT_SAFE')
    filter_ventilation = models.CharField(max_length=50, blank=True, null=True, default='CLEAN_CLEAR')
    refrigerant_leak_check = models.CharField(max_length=50, blank=True, null=True, default='NO_LEAKS')
    control_panel_remote = models.CharField(max_length=50, blank=True, null=True, default='ALL_FUNCTIONAL')

    # Motor Vehicle inspection fields
    engine_condition = models.CharField(max_length=50, blank=True, null=True, default='ENGINE_SMOOTH')
    transmission_clutch = models.CharField(max_length=50, blank=True, null=True, default='SHIFTS_SMOOTH')
    brakes_suspension = models.CharField(max_length=50, blank=True, null=True, default='RESPONSIVE')
    tyres_condition = models.CharField(max_length=50, blank=True, null=True, default='GOOD_TREAD')
    body_exterior = models.CharField(max_length=50, blank=True, null=True, default='CLEAN_INTACT')
    fluids_service = models.CharField(max_length=50, blank=True, null=True, default='UP_TO_DATE')

    # Universal inspection fields
    asset_tag_status = models.CharField(max_length=50, choices=ASSET_TAG_STATUS_CHOICES, default='INTACT_SCANNABLE')
    performance_rating = models.PositiveSmallIntegerField(default=4)
    comments = models.TextField(blank=True)
    submitted_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('session', 'employee', 'asset')
        ordering = ['-submitted_at']

    def __str__(self):
        return f"{self.asset.miczon_id} health check by {self.employee.name}"

# --- ASSET ASSIGNMENT MODULE ---
class AssetAssignment(models.Model):
    ASSIGNMENT_STATUS = [
        ('ASSIGNED', 'Assigned'),
        ('RETURNED', 'Returned'),
    ]

    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name='assignments')
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='assignments')
    
    # Assignment Details
    assigned_date = models.DateField(default=date.today)
    assigned_by = models.CharField(max_length=100, blank=True) # Admin/User who did the assignment
    purpose = models.CharField(max_length=255, blank=True)
    remarks = models.TextField(blank=True)
    status = models.CharField(max_length=20, choices=ASSIGNMENT_STATUS, default='ASSIGNED')

    # Return Details
    returned_date = models.DateField(null=True, blank=True)
    returned_by = models.CharField(max_length=100, blank=True)
    condition = models.CharField(max_length=100, blank=True) # Good, Damaged, etc.

    class Meta:
        constraints = [models.UniqueConstraint(fields=['asset'], condition=models.Q(status='ASSIGNED'), name='one_active_assignment_per_asset')]

    def mark_returned(self, returned_by=None, condition='Good'):
        self.returned_date = date.today()
        self.status = 'RETURNED'
        self.returned_by = returned_by or 'System'
        self.condition = condition
        self.save()

    def save(self, *args, **kwargs):
        with transaction.atomic():
            asset = Asset.objects.select_for_update().get(pk=self.asset_id)
            was_active = bool(self.pk and type(self).objects.filter(pk=self.pk, status='ASSIGNED').exists())
            if self.status == 'ASSIGNED':
                type(self).objects.filter(asset=asset, status='ASSIGNED').exclude(pk=self.pk).update(
                    status='RETURNED', returned_date=date.today(), returned_by='Transfer', condition='Good')
                asset.custodian = self.employee
                asset.current_status = 'ASSIGNED'
                Asset.objects.filter(pk=asset.pk).update(custodian=self.employee, current_status='ASSIGNED')
            elif was_active and asset.custodian_id == self.employee_id:
                broken = any(word in (self.condition or '').lower() for word in ('repair', 'broken', 'damaged'))
                asset.custodian = None
                asset.current_status = 'BROKEN' if broken else 'AVAILABLE'
                Asset.objects.filter(pk=asset.pk).update(custodian=None, current_status=asset.current_status)
            self.asset = asset
            super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.asset.miczon_id} -> {self.employee.name} ({self.status})"

class AssetActionRequest(models.Model):
    ACTION_TYPES = [
        ('ADD', 'Add'),
        ('ASSIGN', 'Assign'),
        ('TRANSFER', 'Transfer'),
        ('RETURN', 'Return'),
        ('REPAIR', 'Repair'),
    ]
    STATUS_CHOICES = [
        ('PENDING', 'Pending'),
        ('APPROVED', 'Approved'),
        ('REJECTED', 'Rejected'),
    ]

    # Made optional since ADD requests won't have an asset initially.
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, null=True, blank=True)
    super_category = models.ForeignKey(SuperCategory, on_delete=models.SET_NULL, null=True, blank=True, related_name='requests')
    requester = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='requests_made')
    action_type = models.CharField(max_length=20, choices=ACTION_TYPES)
    
    # Target for ASSIGN or TRANSFER
    target_employee = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name='requests_received')
    
    # Data for REPAIR
    vendor = models.CharField(max_length=255, blank=True)
    expected_return_date = models.DateField(null=True, blank=True)
    requested_device_type = models.CharField(max_length=100, blank=True)
    specifications = models.TextField(blank=True)

    reason_for_request = models.TextField(blank=True)
    remarks = models.TextField(blank=True)
    
    # Data for ADD
    asset_data = models.JSONField(null=True, blank=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    admin_remarks = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    processed_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True)
    submitted_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='submitted_asset_requests')

    def __str__(self):
        asset_id = self.asset.miczon_id if self.asset else "New Asset"
        return f"{self.action_type} Request: {asset_id} by {self.requester.name}"


# --- HELP DESK / TICKETS: ROUTING FOUNDATION ---
# Config layer that decides where a ticket goes. A ticket's Type routes it to an
# Agent Group (falling back to its Category's default group); the group's members
# are the agents who resolve it. Priority is a static choice on the ticket itself.

class AgentGroup(models.Model):
    """A named team of employees who resolve tickets (e.g. 'IT Support')."""
    name = models.CharField(max_length=100, unique=True)
    description = models.TextField(blank=True)
    members = models.ManyToManyField(Employee, related_name='agent_groups', blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class TicketCategory(models.Model):
    """Top-level bucket for tickets (e.g. 'IT And Technical Support')."""
    name = models.CharField(max_length=120, unique=True)
    description = models.TextField(blank=True)
    # Group that handles this category unless a Type overrides it.
    default_agent_group = models.ForeignKey(
        AgentGroup, on_delete=models.SET_NULL, null=True, blank=True, related_name='categories'
    )
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']
        verbose_name_plural = 'Ticket categories'

    def __str__(self):
        return self.name


class TicketType(models.Model):
    """Sub-classification under a category (e.g. 'Assets Request')."""
    # When set, raising a ticket of this type also spawns a linked
    # AssetActionRequest that performs the real asset operation on approval.
    ASSET_ACTION_CHOICES = [
        ('', '—'),
        ('ADD', 'Add Asset'),
        ('ASSIGN', 'Assign / Provision'),
        ('TRANSFER', 'Transfer'),
        ('RETURN', 'Return'),
        ('REPAIR', 'Repair'),
    ]

    name = models.CharField(max_length=120)
    category = models.ForeignKey(TicketCategory, on_delete=models.CASCADE, related_name='types')
    # Optional per-type routing override; otherwise the category default is used.
    agent_group = models.ForeignKey(
        AgentGroup, on_delete=models.SET_NULL, null=True, blank=True, related_name='ticket_types'
    )
    asset_action = models.CharField(max_length=20, blank=True, default='', choices=ASSET_ACTION_CHOICES)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['category__name', 'name']
        unique_together = ('name', 'category')

    @property
    def resolved_agent_group(self):
        """Where a ticket of this type should route."""
        return self.agent_group or self.category.default_agent_group

    def __str__(self):
        return f"{self.category.name} / {self.name}"


class Ticket(models.Model):
    """A help-desk request raised by an employee, routed to an agent group."""
    PRIORITY_CHOICES = [
        ('HIGH', 'High'),
        ('MEDIUM', 'Medium'),
        ('LOW', 'Low'),
    ]
    STATUS_CHOICES = [
        ('NEW', 'New'),
        ('IN_PROGRESS', 'In Progress'),
        ('RESOLVED', 'Resolved'),
        ('REOPENED', 'Reopened'),
        ('CLOSED', 'Closed'),
    ]

    code = models.CharField(max_length=20, unique=True, blank=True)
    title = models.CharField(max_length=200)
    category = models.ForeignKey(TicketCategory, on_delete=models.PROTECT, related_name='tickets')
    ticket_type = models.ForeignKey(TicketType, on_delete=models.PROTECT, related_name='tickets')
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='MEDIUM')
    description = models.TextField()
    attachment = models.FileField(upload_to='tickets/%Y/%m/', null=True, blank=True)

    raised_by = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='tickets_raised')
    raised_for = models.ForeignKey(
        Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name='tickets_for'
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='NEW')
    assigned_group = models.ForeignKey(
        AgentGroup, on_delete=models.SET_NULL, null=True, blank=True, related_name='tickets'
    )
    assigned_agent = models.ForeignKey(
        Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name='tickets_assigned'
    )
    # Links an asset-request ticket to the AssetActionRequest engine that
    # actually performs the operation (create/assign/transfer/return/repair).
    action_request = models.OneToOneField(
        AssetActionRequest, on_delete=models.SET_NULL, null=True, blank=True, related_name='ticket'
    )

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    resolved_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    # The agent's note to the requester on the most recent status change.
    resolution_note = models.TextField(blank=True, default='')

    class Meta:
        ordering = ['-created_at']

    def save(self, *args, **kwargs):
        # Auto-route to the type's agent group when none is set yet.
        if self.ticket_type_id and self.assigned_group_id is None:
            group = self.ticket_type.resolved_agent_group
            if group:
                self.assigned_group = group
        super().save(*args, **kwargs)
        # Assign a human-readable code once we have a PK.
        if not self.code:
            self.code = f"TKT-{self.pk:05d}"
            super().save(update_fields=['code'])

    def __str__(self):
        return f"{self.code or 'TKT'} - {self.title}"
