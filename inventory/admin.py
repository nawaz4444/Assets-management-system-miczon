from django.contrib import admin
from .models import (
    Asset, Employee, Department, AssetHistory, InspectionLog, AssetAssignment,
    AssetActionRequest, HealthCheckSession, HealthCheckResponse
)

@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ('name', 'floor')

@admin.register(Employee)
class EmployeeAdmin(admin.ModelAdmin):
    list_display = ('name', 'employee_id', 'department', 'user')
    search_fields = ('name', 'employee_id', 'user__username', 'user__email')

@admin.register(Asset)
class AssetAdmin(admin.ModelAdmin):
    # We replaced 'serial_number' with 'miczon_id' here:
    list_display = ('name', 'miczon_id', 'category', 'current_status', 'custodian', 'qr_code_preview')
    search_fields = ('name', 'miczon_id', 'category')
    list_filter = ('current_status', 'department', 'category')
    readonly_fields = ('qr_code_preview',)

    def qr_code_preview(self, obj):
        if obj.qr_code:
            from django.utils.html import mark_safe
            return mark_safe(f'<img src="{obj.qr_code.url}" width="50" height="50" style="object-fit:contain;" />')
        return "No QR Code"
    qr_code_preview.short_description = "QR Code"

@admin.register(AssetHistory)
class AssetHistoryAdmin(admin.ModelAdmin):
    list_display = ('asset', 'action', 'from_employee', 'to_employee', 'date')

@admin.register(InspectionLog)
class InspectionLogAdmin(admin.ModelAdmin):
    list_display = ('asset', 'date', 'status_found', 'inspector_name')

@admin.register(AssetAssignment)
class AssetAssignmentAdmin(admin.ModelAdmin):
    list_display = ('asset', 'employee', 'status', 'assigned_date', 'returned_date')
    list_filter = ('status', 'assigned_date')
    search_fields = ('asset__miczon_id', 'employee__name')

@admin.register(AssetActionRequest)
class AssetActionRequestAdmin(admin.ModelAdmin):
    list_display = ('action_type', 'requester', 'asset', 'requested_device_type', 'status', 'created_at')
    list_filter = ('action_type', 'status', 'created_at')
    search_fields = ('requester__name', 'asset__miczon_id', 'requested_device_type', 'remarks')

@admin.register(HealthCheckSession)
class HealthCheckSessionAdmin(admin.ModelAdmin):
    list_display = ('title', 'status', 'triggered_by', 'created_at', 'closed_at')
    list_filter = ('status', 'created_at')
    search_fields = ('title', 'triggered_by__username')

@admin.register(HealthCheckResponse)
class HealthCheckResponseAdmin(admin.ModelAdmin):
    list_display = ('asset', 'employee', 'session', 'screen_condition', 'battery_life', 'performance_rating', 'submitted_at')
    list_filter = ('screen_condition', 'battery_life', 'performance_rating', 'submitted_at')
    search_fields = ('asset__miczon_id', 'asset__name', 'employee__name', 'comments')
