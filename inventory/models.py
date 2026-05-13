from django.db import models
from django.utils import timezone
import io
import segno
from datetime import date
from django.core.files.base import ContentFile

class Department(models.Model):
    name = models.CharField(max_length=100, unique=True)
    floor = models.CharField(max_length=50, blank=True, null=True)
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
    category = models.CharField(max_length=100, blank=True, verbose_name="Categary")
    specifications = models.TextField(blank=True)
    
    # Relationships
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True)
    custodian = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name='assets')
    
    # Status & Audit
    current_status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='AVAILABLE')
    remarks = models.TextField(blank=True)
    last_inspection_date = models.DateField(null=True, blank=True)
    
    # Repair/Maintenance Fields
    maintenance_vendor = models.CharField(max_length=255, blank=True)
    sent_to_repair_date = models.DateField(null=True, blank=True)
    expected_return_date = models.DateField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    @property
    def is_overdue_repair(self):
        if self.current_status == 'BROKEN' and self.expected_return_date:
            return date.today() > self.expected_return_date
        return False

    # QR Code Field
    qr_code = models.ImageField(upload_to='qrcodes/', blank=True, null=True)

    def save(self, *args, **kwargs):
        # Auto-generate QR code if it doesn't exist
        if not self.qr_code:
            # QR Content: Direct link to asset details
            payload = f"https://assets.miczon.com/a/{self.miczon_id}"
            
            # Generate QR (Micro=False for standard size, M for error correction)
            qr = segno.make(payload, micro=False, error='M')
            
            # Save to memory buffer
            buffer = io.BytesIO()
            qr.save(buffer, kind='png', scale=10, border=1)
            
            # Save to model field
            filename = f"qr_{self.miczon_id}.png"
            self.qr_code.save(filename, ContentFile(buffer.getvalue()), save=False)
            
        super().save(*args, **kwargs)

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

    title = models.CharField(max_length=150, default='Global Hardware Health Check')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='OPEN')
    triggered_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    closed_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f"{self.title} ({self.created_at:%Y-%m-%d})"

class HealthCheckResponse(models.Model):
    SCREEN_CHOICES = [
        ('EXCELLENT', 'Excellent'),
        ('GOOD', 'Good'),
        ('SCRATCHED', 'Scratched'),
        ('CRACKED', 'Cracked'),
        ('NEEDS_REPAIR', 'Needs Repair'),
    ]
    BATTERY_CHOICES = [
        ('EXCELLENT', 'Excellent'),
        ('GOOD', 'Good'),
        ('FAIR', 'Fair'),
        ('POOR', 'Poor'),
        ('NOT_APPLICABLE', 'Not Applicable'),
    ]

    session = models.ForeignKey(HealthCheckSession, on_delete=models.CASCADE, related_name='responses')
    employee = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='health_check_responses')
    asset = models.ForeignKey(Asset, on_delete=models.CASCADE, related_name='health_trail')
    screen_condition = models.CharField(max_length=30, choices=SCREEN_CHOICES)
    battery_life = models.CharField(max_length=30, choices=BATTERY_CHOICES)
    performance_rating = models.PositiveSmallIntegerField()
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

    def mark_returned(self, returned_by=None, condition='Good'):
        self.returned_date = date.today()
        self.status = 'RETURNED'
        self.returned_by = returned_by or 'System'
        self.condition = condition
        self.save()

    def save(self, *args, **kwargs):
        # 1. Update Parent Asset Status
        if self.status == 'ASSIGNED':
            self.asset.custodian = self.employee
            self.asset.current_status = 'ASSIGNED'
        elif self.status == 'RETURNED':
            # Only clear custodian if this is the ACTIVE assignment being returned
            if self.asset.custodian == self.employee:
                self.asset.custodian = None
                # Check condition: if repair is needed, set status to BROKEN
                condition_lower = (self.condition or '').lower()
                if 'repair' in condition_lower or 'broken' in condition_lower or 'damaged' in condition_lower:
                    self.asset.current_status = 'BROKEN'
                else:
                    self.asset.current_status = 'AVAILABLE'
        
        self.asset.save()
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
    requester = models.ForeignKey(Employee, on_delete=models.CASCADE, related_name='requests_made')
    action_type = models.CharField(max_length=20, choices=ACTION_TYPES)
    
    # Target for ASSIGN or TRANSFER
    target_employee = models.ForeignKey(Employee, on_delete=models.SET_NULL, null=True, blank=True, related_name='requests_received')
    
    # Data for REPAIR
    vendor = models.CharField(max_length=255, blank=True)
    expected_return_date = models.DateField(null=True, blank=True)
    requested_device_type = models.CharField(max_length=100, blank=True)
    
    reason_for_request = models.TextField(blank=True)
    remarks = models.TextField(blank=True)
    
    # Data for ADD
    asset_data = models.JSONField(null=True, blank=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING')
    admin_remarks = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    processed_at = models.DateTimeField(null=True, blank=True)
    processed_by = models.ForeignKey('auth.User', on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        asset_id = self.asset.miczon_id if self.asset else "New Asset"
        return f"{self.action_type} Request: {asset_id} by {self.requester.name}"
