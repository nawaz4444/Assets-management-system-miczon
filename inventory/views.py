from rest_framework import viewsets, permissions, serializers
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from django.http import FileResponse, HttpResponse
from .models import (
    Asset, Employee, Department, AssetHistory, AssetAssignment, InspectionLog,
    AssetActionRequest, HealthCheckSession, HealthCheckResponse, SuperCategory
)
from .serializers import (
    AssetSerializer, EmployeeSerializer, DepartmentSerializer, 
    AssetAssignmentSerializer, InspectionLogSerializer, AssetListSerializer, 
    AssetDetailSerializer, UserSerializer, AssetActionRequestSerializer,
    HealthCheckSessionSerializer, HealthCheckResponseSerializer, SuperCategorySerializer
)
from rest_framework.decorators import action
from django.db import transaction
from django.db.models import Count, Exists, OuterRef, Q
import pandas as pd
import uuid  # <--- Added this to generate unique IDs
import logging

logger = logging.getLogger(__name__)

class SuperCategoryViewSet(viewsets.ModelViewSet):
    queryset = SuperCategory.objects.all().order_by('id')
    serializer_class = SuperCategorySerializer
    def get_permissions(self):
        return [IsAdminUserOrReadOnly()]
from io import BytesIO
from datetime import date
from django.utils import timezone
from rest_framework.pagination import PageNumberPagination
from openpyxl import Workbook
from openpyxl.styles import Font, PatternFill, Alignment
import re
from decimal import Decimal, InvalidOperation
from .services import employee_for_user, session_assets, inspection_fields

# --- PERMISSIONS ---
class NotStockOnlyUser(permissions.BasePermission):
    """Denies access to stock-only users for non-stock management views."""
    message = "Access restricted to stock management."

    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        if not user or not user.is_authenticated:
            return False
        if user.is_superuser:
            return True
        return not user.groups.filter(name='Stock Only').exists()


class IsAdminUserOrReadOnly(permissions.BasePermission):
    """Any authenticated non-stock user may read; only superusers may create/update/delete."""
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if not request.user.is_superuser and request.user.groups.filter(name='Stock Only').exists():
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user.is_superuser)

# --- PAGINATION ---
class StandardResultsSetPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 100

# --- UTILS ---
def get_employee_filter(user, prefix=''):
    """Build an ownership filter from the explicit User/Employee link."""
    if user.is_superuser:
        return Q()
    employee = employee_for_user(user)
    key = f"{prefix}pk" if prefix else 'pk'
    return Q(**{key: employee.pk if employee else None}) & Q(**{f"{key}__isnull": False})

def _get_employee_requester(user):
    return employee_for_user(user)

def _is_manager(user):
    if not user or not user.is_authenticated:
        return False
    if user.is_superuser:
        return True
    emp = _get_employee_requester(user)
    return bool(emp and emp.managed_departments.exists())

def _get_managed_department_ids(user):
    if not user or not user.is_authenticated:
        return []
    if user.is_superuser:
        return list(Department.objects.values_list('id', flat=True))
    emp = _get_employee_requester(user)
    if not emp:
        return []
    return list(emp.managed_departments.values_list('id', flat=True))

def _get_team_employee_ids(user):
    if not user or not user.is_authenticated:
        return []
    emp = _get_employee_requester(user)
    self_id = [emp.id] if emp else []
    if user.is_superuser:
        return list(Employee.objects.values_list('id', flat=True))
    dept_ids = _get_managed_department_ids(user)
    if not dept_ids:
        return self_id
    team_ids = list(Employee.objects.filter(department_id__in=dept_ids).values_list('id', flat=True))
    return list(set(self_id + team_ids))

def clean_import_value(value, default=''):
    if pd.isna(value):
        return default
    text = str(value).strip()
    return default if text.lower() == 'nan' else text

def get_import_value(row, *column_names, default=''):
    for column_name in column_names:
        if column_name in row:
            value = clean_import_value(row.get(column_name), default='')
            if value:
                return value
    return default

def get_import_raw(row, *column_names):
    """Return the first non-empty raw cell value (unstringified) for the given columns."""
    for column_name in column_names:
        if column_name in row:
            value = row.get(column_name)
            if not pd.isna(value):
                return value
    return None

def parse_import_date(value):
    """Coerce an Excel cell into an ISO date string (YYYY-MM-DD), or None."""
    if value is None or pd.isna(value):
        return None
    parsed = pd.to_datetime(value, errors='coerce', dayfirst=True)
    if pd.isna(parsed):
        return None
    return parsed.date().isoformat()

def parse_import_price(value):
    """Coerce an Excel cell into a Decimal-safe string, or None. Strips currency symbols/commas."""
    if value is None or pd.isna(value):
        return None
    cleaned = re.sub(r'[^0-9.\-]', '', str(value).strip())
    if cleaned in ('', '-', '.', '-.'):
        return None
    try:
        return str(Decimal(cleaned))
    except (InvalidOperation, ValueError):
        return None

def build_asset_import_template():
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = 'Assets'

    headers = [
        'Miczon ID',
        'Device Name',
        'Super Category',
        'Category',
        'Department',
        'Custodian',
        'Employee ID',
        'Email',
        'Purchase Date',
        'Purchase Price (PKR)',
        'Specifications',
        'Remarks',
        'Status',
    ]
    sheet.append(headers)

    header_fill = PatternFill(fill_type='solid', fgColor='D9EAF7')
    for cell in sheet[1]:
        cell.font = Font(bold=True)
        cell.fill = header_fill

    for column_cells in sheet.columns:
        max_length = max(len(str(cell.value or '')) for cell in column_cells)
        sheet.column_dimensions[column_cells[0].column_letter].width = min(max(max_length + 3, 14), 34)

    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return output

def build_employee_import_template():
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = 'Employees'

    headers = [
        'Employee Name',
        'Employee ID',
        'Email',
        'Department',
    ]
    sheet.append(headers)

    header_fill = PatternFill(fill_type='solid', fgColor='D9EAF7')
    for cell in sheet[1]:
        cell.font = Font(bold=True)
        cell.fill = header_fill

    for column_cells in sheet.columns:
        max_length = max(len(str(cell.value or '')) for cell in column_cells)
        sheet.column_dimensions[column_cells[0].column_letter].width = min(max(max_length + 3, 18), 40)

    output = BytesIO()
    workbook.save(output)
    output.seek(0)
    return output

def build_next_miczon_ids(quantity):
    existing_ids = Asset.objects.values_list('miczon_id', flat=True)
    highest_number = 1000

    for miczon_id in existing_ids:
        match = re.search(r'(\d+)(?!.*\d)', str(miczon_id or ''))
        if match:
            highest_number = max(highest_number, int(match.group(1)))

    return [f"MZ-{number}" for number in range(highest_number + 1, highest_number + quantity + 1)]

# --- AUTH VIEWS ---
class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        serializer = UserSerializer(request.user)
        return Response(serializer.data)

class ScanAssetView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request, miczon_id):
        asset = Asset.objects.filter(miczon_id=miczon_id).only('id').first()
        if asset:
            return Response({"status": "found", "asset_id": asset.id})
        return Response({"status": "not_found", "miczon_id": miczon_id})

# --- VIEWSETS ---
class AssetAssignmentViewSet(viewsets.ModelViewSet):
    queryset = AssetAssignment.objects.select_related('asset', 'employee').order_by('-assigned_date')
    serializer_class = AssetAssignmentSerializer
    permission_classes = [permissions.IsAuthenticated, NotStockOnlyUser]

    def get_queryset(self):
        queryset = super().get_queryset()
        if not self.request.user.is_superuser:
            # Filter assignments by the employee
            emp_filter = get_employee_filter(self.request.user, prefix='employee__')
            queryset = queryset.filter(emp_filter)
        return queryset

    def create(self, request, *args, **kwargs):
        # Strict Admin Approval Interception for Assign
        if not request.user.is_superuser:
            from .models import AssetActionRequest, Asset
            
            # Use same logic to find employee requester profile
            asset_id = serializers.IntegerField(min_value=1).run_validation(request.data.get('asset'))
            employee_id = serializers.IntegerField(min_value=1).run_validation(request.data.get('employee'))
            if employee_id not in _get_team_employee_ids(request.user):
                return Response({'error': 'You cannot assign assets to this employee.'}, status=403)
            
            # Redirect to approval flow
            requester = _get_employee_requester(request.user)
            if not requester:
                return Response({"error": "Employee profile not found. Please contact admin to link your user account to an employee profile."}, status=400)
            
            try:
                asset = Asset.objects.get(id=asset_id)
            except Asset.DoesNotExist:
                return Response({"error": "Asset not found"}, status=400)
            if asset.custodian_id and asset.custodian_id not in _get_team_employee_ids(request.user):
                return Response({'error': 'This asset belongs to another employee.'}, status=403)
                
            AssetActionRequest.objects.create(
                submitted_by=request.user,
                asset=asset,
                requester=requester,
                action_type='ASSIGN',
                target_employee_id=employee_id,
                remarks=request.data.get('remarks', 'Direct Assignment Request')
            )
            return Response({"status": "Assignment request submitted for approval"}, status=201)
            
        return super().create(request, *args, **kwargs)

    def update(self, request, *args, **kwargs):
        # Intercept Return (PATCH to assignment status)
        logger.debug("Update Assignment - User: %s, IsSuper: %s", request.user.username, request.user.is_superuser)
        if not request.user.is_superuser:
            if request.data.get('status') == 'RETURNED':
                 # Redirect to approval flow for Return
                 from .models import AssetActionRequest
                 asset = self.get_object().asset
                 requester = _get_employee_requester(request.user)
                 
                 AssetActionRequest.objects.create(
                     submitted_by=request.user,
                     asset=asset,
                     requester=requester,
                     action_type='RETURN',
                     remarks=f"Return Details: {request.data.get('remarks', 'N/A')}"
                 )
                 return Response({"status": "Return request submitted for approval"}, status=201)
            return Response({"error": "Only admins can modify assignments directly"}, status=403)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        return self.update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        return Response({"error": "Assignment history cannot be deleted. Return the asset instead."}, status=403)

class InspectionLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = InspectionLog.objects.select_related('asset').order_by('-date')
    serializer_class = InspectionLogSerializer
    permission_classes = [permissions.IsAuthenticated, NotStockOnlyUser]

    def get_queryset(self):
        queryset = super().get_queryset()
        if not self.request.user.is_superuser:
            # Filter logs for assets where the user is the custodian
            emp_filter = get_employee_filter(self.request.user, prefix='asset__custodian__')
            queryset = queryset.filter(emp_filter)
        return queryset

class AssetViewSet(viewsets.ModelViewSet):
    queryset = Asset.objects.all().order_by('-created_at')
    serializer_class = AssetDetailSerializer  # Default for create/update
    pagination_class = StandardResultsSetPagination
    permission_classes = [permissions.IsAuthenticated, NotStockOnlyUser]

    def get_serializer_class(self):
        """
        Use lightweight serializer for list views,
        full serializer for detail/create/update views.
        """
        if self.action == 'list':
            return AssetListSerializer
        return AssetDetailSerializer

    def get_queryset(self):
        # OPTIMIZATION: Use select_related and prefetch_related to prevent N+1 queries
        queryset = Asset.objects.all().select_related('custodian', 'department', 'super_category')
        
        # Only prefetch heavy relations for detail views
        if self.action == 'retrieve':
            queryset = queryset.prefetch_related('history', 'inspectionlog_set')
        
        queryset = queryset.order_by('-created_at')
        
        # Filter parameters
        custodian = self.request.query_params.get('custodian')
        department = self.request.query_params.get('department')
        status = self.request.query_params.get('status')
        category = self.request.query_params.get('category')
        super_category = self.request.query_params.get('super_category')
        search = self.request.query_params.get('search')
        
        if custodian:
            queryset = queryset.filter(custodian_id=custodian)
        if department:
            queryset = queryset.filter(department_id=department)
        if status:
            queryset = queryset.filter(current_status=status)
        if category:
            queryset = queryset.filter(category__iexact=category)
        if super_category and str(super_category).lower() != 'all':
            if str(super_category).isdigit():
                queryset = queryset.filter(super_category_id=super_category)
            else:
                queryset = queryset.filter(Q(super_category__code__iexact=super_category) | Q(super_category__name__iexact=super_category))
        if search:
            # Search across multiple fields
            queryset = queryset.filter(
                Q(miczon_id__icontains=search) |
                Q(name__icontains=search) |
                Q(custodian__name__icontains=search) |
                Q(category__icontains=search)
            )
        
        # OWNER / MANAGER RESTRICTION
        if not (self.request.user.is_superuser or self.request.user.is_staff):
            dept_ids = _get_managed_department_ids(self.request.user)
            team_ids = _get_team_employee_ids(self.request.user)
            if dept_ids or team_ids:
                emp_filter = get_employee_filter(self.request.user, prefix='custodian__')
                queryset = queryset.filter(
                    Q(department_id__in=dept_ids) |
                    Q(custodian_id__in=team_ids) |
                    emp_filter
                )
            else:
                emp_filter = get_employee_filter(self.request.user, prefix='custodian__')
                queryset = queryset.filter(emp_filter)
            
        return queryset

    def create(self, request, *args, **kwargs):
        if not request.user.is_superuser:
            if not _is_manager(request.user):
                return Response({"error": "Only managers may request new assets."}, status=403)
            miczon_id = request.data.get('miczon_id')
            if not miczon_id:
                return Response({"error": "Miczon ID is required"}, status=400)
                
            if Asset.objects.filter(miczon_id=miczon_id).exists():
                return Response({"miczon_id": ["Asset with this Miczon ID already exists."]}, status=400)
                
            requester = _get_employee_requester(request.user)
            if not requester:
                return Response({"error": "Employee profile not found for user. Please contact admin to link your user account to an employee profile."}, status=400)
            
            proposed_asset = self.get_serializer(data=request.data)
            proposed_asset.is_valid(raise_exception=True)
            custodian = proposed_asset.validated_data.get('custodian')
            if custodian and custodian.pk not in _get_team_employee_ids(request.user):
                return Response({'error': 'The custodian must belong to your team.'}, status=403)
            AssetActionRequest.objects.create(
                submitted_by=request.user,
                requester=requester,
                action_type='ADD',
                asset_data=request.data,
                remarks='Requesting to add new asset'
            )
            return Response({"status": "Add asset request submitted for approval", "miczon_id": request.data.get('miczon_id')}, status=201)
        
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        asset = serializer.save()
        if asset.custodian and asset.current_status != 'BROKEN':
            asset.current_status = 'ASSIGNED'
            asset.save(update_fields=['current_status'])
            AssetHistory.objects.create(
                asset=asset,
                action='ADD_ASSIGN',
                to_employee=asset.custodian,
                remarks='Asset added and assigned from inventory manager.'
            )

    def perform_update(self, serializer):
        # Only superusers can directly update assets
        if not self.request.user.is_superuser:
            return # Should have been blocked by update/partial_update anyway
            
        instance = self.get_object()
        old_custodian = instance.custodian
        updated_asset = serializer.save()

        if updated_asset.custodian and updated_asset.current_status != 'BROKEN':
            updated_asset.current_status = 'ASSIGNED'
            updated_asset.save(update_fields=['current_status'])
        elif not updated_asset.custodian and updated_asset.current_status == 'ASSIGNED':
            updated_asset.current_status = 'AVAILABLE'
            updated_asset.save(update_fields=['current_status'])
        
        if updated_asset.custodian != old_custodian:
            action = 'ASSIGN' if updated_asset.custodian else 'RETURN'
            AssetHistory.objects.create(
                asset=updated_asset, action=action,
                from_employee=old_custodian, to_employee=updated_asset.custodian,
                remarks=f"Status changed to {updated_asset.current_status}. (Direct Admin Update)"
            )

    def update(self, request, *args, **kwargs):
        if not request.user.is_superuser:
            return Response({"error": "Direct updates are restricted. Please use specific action flows (Transfer/Repair/etc) which are subject to approval."}, status=403)
        return super().update(request, *args, **kwargs)

    def partial_update(self, request, *args, **kwargs):
        if not request.user.is_superuser:
             return self.update(request, *args, **kwargs)
        return super().partial_update(request, *args, **kwargs)
    
    def destroy(self, request, *args, **kwargs):
        if not request.user.is_superuser:
            return Response({"error": "Deletions restricted to administrators."}, status=403)
        return super().destroy(request, *args, **kwargs)

    @action(detail=False, methods=['get'], url_path='import-template')
    def import_template(self, request):
        template = build_asset_import_template()
        return FileResponse(
            template,
            as_attachment=True,
            filename='asset_import_template.xlsx',
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )

    @action(detail=False, methods=['get'], url_path='next-miczon-ids')
    def next_miczon_ids(self, request):
        try:
            quantity = int(request.query_params.get('quantity', 1))
        except (TypeError, ValueError):
            quantity = 1

        quantity = max(1, min(quantity, 500))
        return Response({"ids": build_next_miczon_ids(quantity)})

    @action(detail=False, methods=['post'], url_path='import', parser_classes=[MultiPartParser, FormParser])
    def import_assets(self, request):
        """
        STAGE 1: PRE-FLIGHT CHECK
        Parses Excel and reconciles data against the DB without saving.
        Returns a preview of valid rows and flagged errors.
        """
        if not request.user.is_superuser:
            return Response({"success": False, "message": "Only admins can import assets."}, status=403)

        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({"success": False, "message": "Please upload an Excel file."}, status=400)

        try:
            df = pd.read_csv(file_obj) if file_obj.name.lower().endswith('.csv') else pd.read_excel(file_obj)
        except Exception as exc:
            return Response({"success": False, "message": f"Unable to read Excel file: {exc}"}, status=400)

        if df.empty:
            return Response({"success": False, "message": "The uploaded Excel file has no asset rows."}, status=400)

        df.columns = [str(column).strip().lower() for column in df.columns]

        valid_rows = []
        errors = []
        seen_miczon_ids = set()

        for index, row in df.iterrows():
            excel_row_number = index + 2
            row_errors = []

            # 1. Reconciliation: Miczon ID (Hardware Key)
            miczon_id = get_import_value(row, 'miczon id', 'mic id', 'serial number', 'serial no', 'asset tag')
            if not miczon_id:
                row_errors.append("Missing Miczon ID")
            elif miczon_id in seen_miczon_ids:
                row_errors.append(f"Duplicate Miczon ID in file: {miczon_id}")
            seen_miczon_ids.add(miczon_id)

            # 2. Reconciliation: Device Name
            device_name = get_import_value(row, 'device name', 'device', 'name')
            if not device_name:
                row_errors.append("Missing Device Name")

            # 3. Reconciliation: Custodian (Employee Reconciliation Engine)
            # Support variations: Custodian, Custody, Assigned User, User, Employee
            custodian_name = get_import_value(row, 'custodian', 'custody', 'assigned user', 'user', 'employee name', 'employee')
            employee_id = get_import_value(row, 'employee id', 'employee code', 'emp id', 'id')

            resolved_employee = None
            if employee_id:
                resolved_employee = Employee.objects.filter(employee_id__iexact=employee_id).first()
                if not resolved_employee:
                    row_errors.append(f"Employee ID '{employee_id}' not found in system")
            elif custodian_name:
                # Fallback to name search if ID is missing, but fuzzy matches are dangerous
                resolved_employee = Employee.objects.filter(name__iexact=custodian_name).first()
                if not resolved_employee:
                    row_errors.append(f"Custodian '{custodian_name}' not found by name. (Try providing Employee ID)")

            # 4. Department logic
            dept_name = get_import_value(row, 'department')
            resolved_dept_id = None
            if resolved_employee and resolved_employee.department:
                resolved_dept_id = resolved_employee.department.id
            elif dept_name:
                dept = Department.objects.filter(name__iexact=dept_name).first()
                if dept:
                    resolved_dept_id = dept.id

            # 5. Financial fields (optional)
            purchase_date = parse_import_date(
                get_import_raw(row, 'purchase date', 'purchase_date', 'date of purchase')
            )
            purchase_price = parse_import_price(
                get_import_raw(row, 'purchase price (pkr)', 'purchase price', 'purchase_price', 'price', 'cost', 'purchase cost')
            )

            # Prepare staging data
            category_value = get_import_value(row, 'super category', 'super_category') or request.data.get('super_category') or 'it_assets'
            category_q = Q(pk=int(category_value)) if str(category_value).isdigit() else (Q(code__iexact=category_value) | Q(name__iexact=category_value))
            super_category = SuperCategory.objects.filter(category_q).first()
            if not super_category:
                row_errors.append('Select a valid Super Category')
            imported_status = get_import_value(row, 'status', default='AVAILABLE').upper().replace(' ', '_')
            if imported_status not in dict(Asset.STATUS_CHOICES):
                row_errors.append('Status must be AVAILABLE, ASSIGNED, or BROKEN')
            row_data = {
                "excel_row": excel_row_number,
                "super_category": super_category.pk if super_category else None,
                "miczon_id": miczon_id,
                "name": device_name,
                "category": get_import_value(row, 'category', 'categary'),
                "custodian_id": resolved_employee.id if resolved_employee else None,
                "custodian_name": resolved_employee.name if resolved_employee else custodian_name,
                "department_id": resolved_dept_id,
                "purchase_date": purchase_date,
                "purchase_price": purchase_price,
                "specifications": get_import_value(row, 'specifications', 'specs', 'details'),
                "remarks": get_import_value(row, 'remarks', 'notes'),
                "status": get_import_value(row, 'status', default='AVAILABLE').upper().replace(' ', '_')
            }

            if row_errors:
                errors.append({"row": excel_row_number, "miczon_id": miczon_id, "messages": row_errors})
            else:
                valid_rows.append(row_data)

        return Response({
            "success": True,
            "summary": {
                "total": len(df),
                "valid": len(valid_rows),
                "errors": len(errors)
            },
            "valid_rows": valid_rows,
            "errors": errors
        })

    @action(detail=False, methods=['post'], url_path='bulk-commit')
    def bulk_commit(self, request):
        """
        STAGE 2: ATOMIC EXECUTION
        Saves the validated staging data to the database.
        """
        if not request.user.is_superuser:
            return Response({"error": "Unauthorized"}, status=403)

        rows = request.data.get('rows', [])
        if not rows:
            return Response({"error": "No data to commit"}, status=400)

        created_count = 0
        updated_count = 0

        try:
            with transaction.atomic():
                for row in rows:
                    check = AssetDetailSerializer(data={
                        'miczon_id': row.get('miczon_id'), 'name': row.get('name'),
                        'super_category': row.get('super_category'), 'category': row.get('category', ''),
                        'custodian': row.get('custodian_id'), 'department': row.get('department_id'),
                        'current_status': row.get('status', 'AVAILABLE'),
                        'purchase_date': row.get('purchase_date'), 'purchase_price': row.get('purchase_price'),
                    }, instance=Asset.objects.filter(miczon_id=row.get('miczon_id')).first())
                    check.is_valid(raise_exception=True)
                    if not check.validated_data.get('super_category'):
                        raise serializers.ValidationError({'super_category': 'Required for every imported asset.'})
                    asset, created = Asset.objects.update_or_create(
                        miczon_id=row['miczon_id'],
                        defaults={
                            'name': row['name'],
                            'super_category_id': row.get('super_category'),
                            'category': row.get('category'),
                            'department_id': row.get('department_id'),
                            'custodian_id': row.get('custodian_id'),
                            'current_status': 'ASSIGNED' if row.get('custodian_id') and row.get('status') != 'BROKEN' else row.get('status', 'AVAILABLE'),
                            'purchase_date': row.get('purchase_date') or None,
                            'purchase_price': row.get('purchase_price') if row.get('purchase_price') not in (None, '') else None,
                            'specifications': row.get('specifications', ''),
                            'remarks': row.get('remarks', ''),
                        }
                    )

                    if created:
                        created_count += 1
                        AssetHistory.objects.create(
                            asset=asset,
                            action='IMPORT',
                            remarks="Added via bulk excel import staging."
                        )
                    else:
                        updated_count += 1

            return Response({
                "success": True,
                "message": f"Bulk import complete. Created: {created_count}, Updated: {updated_count}",
                "created": created_count,
                "updated": updated_count
            })
        except serializers.ValidationError:
            raise
        except Exception:
            logger.exception('Asset import failed')
            return Response({'success': False, 'message': 'Import failed; no rows were committed.'}, status=400)

    @action(detail=False, methods=['get'], url_path='export')
    def export(self, request):
        queryset = self.get_queryset()
        
        workbook = Workbook()
        sheet = workbook.active
        sheet.title = 'Inventory'

        headers = [
            'Miczon ID', 'Device Name', 'Super Category', 'Category', 'Status',
            'Department', 'Custodian', 'Employee ID',
            'Purchase Date', 'Purchase Price (PKR)',
            'Maintenance Vendor', 'Sent to Repair', 'Expected Return',
            'Specifications', 'Remarks'
        ]
        sheet.append(headers)

        header_fill = PatternFill(fill_type='solid', fgColor='D9EAF7')
        for cell in sheet[1]:
            cell.font = Font(bold=True)
            cell.fill = header_fill

        for asset in queryset:
            sheet.append([
                asset.miczon_id,
                asset.name,
                asset.super_category.code if asset.super_category else '',
                asset.category,
                asset.current_status,
                asset.department.name if asset.department else 'N/A',
                asset.custodian.name if asset.custodian else 'N/A',
                asset.custodian.employee_id if asset.custodian else 'N/A',
                asset.purchase_date.strftime('%Y-%m-%d') if asset.purchase_date else '',
                float(asset.purchase_price) if asset.purchase_price is not None else '',
                asset.maintenance_vendor or '',
                asset.sent_to_repair_date.strftime('%Y-%m-%d') if asset.sent_to_repair_date else '',
                asset.expected_return_date.strftime('%Y-%m-%d') if asset.expected_return_date else '',
                asset.specifications,
                asset.remarks
            ])

        for column_cells in sheet.columns:
            max_length = 0
            for cell in column_cells:
                try:
                    if len(str(cell.value)) > max_length:
                        max_length = len(str(cell.value))
                except:
                    pass
            sheet.column_dimensions[column_cells[0].column_letter].width = min(max(max_length + 2, 12), 40)

        output = BytesIO()
        workbook.save(output)
        output.seek(0)

        response = HttpResponse(
            output.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = 'attachment; filename="inventory_export.xlsx"'
        return response
    @action(detail=True, methods=['post'])
    def transfer(self, request, pk=None):
        asset = self.get_object()
        to_employee_id = request.data.get('to_employee_id')
        remarks = request.data.get('remarks', 'Direct Transfer')
        
        try:
            to_employee = Employee.objects.get(pk=to_employee_id)
        except Employee.DoesNotExist:
            return Response({"error": "Employee not found"}, status=400)

        # If user is not superuser, create request for approval
        if not request.user.is_superuser:
            requester = _get_employee_requester(request.user)
            if not requester:
                return Response({"error": "Employee profile not found for user"}, status=400)
            
            AssetActionRequest.objects.create(
                asset=asset,
                requester=requester,
                action_type='TRANSFER',
                target_employee=to_employee,
                remarks=remarks
            )
            return Response({"status": "Transfer request submitted for approval"})

        # Superuser: Direct transfer logic
        from_employee = asset.custodian
        active_assignment = AssetAssignment.objects.filter(asset=asset, status='ASSIGNED').first()
        if active_assignment:
            active_assignment.mark_returned(returned_by='Transfer Action', condition='Good')
        
        AssetAssignment.objects.create(
            asset=asset,
            employee=to_employee,
            remarks=remarks,
            status='ASSIGNED'
        )
        AssetHistory.objects.create(
            asset=asset,
            action="TRANSFER",
            from_employee=from_employee,
            to_employee=to_employee,
            remarks=remarks
        )
        return Response({"status": "Asset transferred successfully"})

    @action(detail=True, methods=['post'])
    def repair(self, request, pk=None):
        asset = self.get_object()
        vendor = request.data.get('vendor')
        expected_return = request.data.get('expected_return')
        issue = request.data.get('issue', 'Broken/Repair')
        
        # If user is not superuser, create request for approval
        if not request.user.is_superuser:
            requester = _get_employee_requester(request.user)
            if not requester:
                return Response({"error": "Employee profile not found for user"}, status=400)
            
            AssetActionRequest.objects.create(
                asset=asset,
                requester=requester,
                action_type='REPAIR',
                vendor=vendor,
                expected_return_date=expected_return,
                remarks=issue
            )
            return Response({"status": "Repair request submitted for approval"})

        # Superuser logic
        active_assignment = AssetAssignment.objects.filter(asset=asset, status='ASSIGNED').first()
        if active_assignment:
            active_assignment.mark_returned(returned_by='Repair Action', condition='Broken')
            
        asset.current_status = 'BROKEN'
        asset.maintenance_vendor = vendor
        asset.sent_to_repair_date = date.today()
        asset.expected_return_date = expected_return
        asset.save()
        
        AssetHistory.objects.create(
            asset=asset,
            action="REPAIR",
            remarks=f"Sent to {vendor}. Issue: {issue}"
        )
        return Response({"status": "Asset sent to repair"})

    @action(detail=True, methods=['post'])
    def return_from_repair(self, request, pk=None):
        if not request.user.is_superuser:
            return Response({'error': 'Only administrators can complete repairs.'}, status=403)
        asset = self.get_object()
        condition = request.data.get('condition', 'Good')
        remarks = request.data.get('remarks', 'Returned from repair')
        returned_by = request.data.get('returned_by', 'Admin')
        
        # 1. Update Asset Status to AVAILABLE
        asset.current_status = 'AVAILABLE'
        
        # 2. Clear repair-related fields
        asset.maintenance_vendor = ''
        asset.sent_to_repair_date = None
        asset.expected_return_date = None
        
        asset.save()
        
        # 3. Log history
        AssetHistory.objects.create(
            asset=asset,
            action="RETURN_FROM_REPAIR",
            remarks=f"Returned from repair. Condition: {condition}. {remarks}"
        )
        
        return Response({"status": "Asset returned to inventory successfully"})

class EmployeeViewSet(viewsets.ModelViewSet):
    queryset = Employee.objects.all()
    serializer_class = EmployeeSerializer
    permission_classes = [IsAdminUserOrReadOnly]

    def get_queryset(self):
        queryset = Employee.objects.select_related('department').annotate(
            assigned_assets_count=Count('assets', filter=Q(assets__current_status='ASSIGNED')),
            is_manager_flag=Exists(Department.objects.filter(manager_id=OuterRef('pk'))),
        )
        department = self.request.query_params.get('department')
        if department:
            queryset = queryset.filter(department_id=department)

        search = self.request.query_params.get('search')
        if search:
            queryset = queryset.filter(
                Q(name__icontains=search) |
                Q(employee_id__icontains=search) |
                Q(email__icontains=search)
            )
            
        # Security: Employees / Managers accessibility
        if not self.request.user.is_superuser:
            team_ids = _get_team_employee_ids(self.request.user)
            if team_ids:
                emp_filter = get_employee_filter(self.request.user)
                queryset = queryset.filter(Q(id__in=team_ids) | emp_filter)
            else:
                emp_filter = get_employee_filter(self.request.user)
                queryset = queryset.filter(emp_filter)
            
        return queryset

    @action(detail=False, methods=['get'], url_path='import-template')
    def import_template(self, request):
        template = build_employee_import_template()
        return FileResponse(
            template,
            as_attachment=True,
            filename='employee_import_template.xlsx',
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        )

    @action(detail=False, methods=['post'], url_path='import', parser_classes=[MultiPartParser, FormParser])
    def import_employees(self, request):
        if not request.user.is_superuser:
            return Response({"success": False, "message": "Only admins can import employees."}, status=403)

        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({"success": False, "message": "Please upload an Excel file."}, status=400)

        try:
            df = pd.read_excel(file_obj)
        except Exception as exc:
            return Response({"success": False, "message": f"Unable to read Excel file: {exc}"}, status=400)

        if df.empty:
            return Response({"success": False, "message": "The uploaded Excel file has no employee rows."}, status=400)

        df.columns = [str(column).strip().lower() for column in df.columns]
        created_count = 0
        updated_count = 0
        skipped_rows = []

        for index, row in df.iterrows():
            excel_row_number = index + 2
            name = get_import_value(row, 'employee name', 'name', 'full name')
            emp_id = get_import_value(row, 'employee id', 'emp id', 'id', 'employee code')
            
            if not name:
                skipped_rows.append(f"Row {excel_row_number}: Missing Employee Name")
                continue
                
            if not emp_id:
                # If no ID provided, try to find by name or email, or skip
                email = get_import_value(row, 'email', 'employee email')
                existing = None
                if email:
                    existing = Employee.objects.filter(email__iexact=email).first()
                if not existing:
                    existing = Employee.objects.filter(name__iexact=name).first()
                
                if existing:
                    emp_id = existing.employee_id
                else:
                    skipped_rows.append(f"Row {excel_row_number}: Missing Employee ID")
                    continue

            employee_email = get_import_value(row, 'email', 'employee email')
            try:
                serializers.EmailField(allow_blank=True).run_validation(employee_email)
            except serializers.ValidationError:
                skipped_rows.append(f"Row {excel_row_number}: Invalid email address")
                continue
            department = None
            department_name = get_import_value(row, 'department')
            if department_name:
                department, _ = Department.objects.get_or_create(name=department_name)

            employee_email = get_import_value(row, 'email', 'employee email')

            _, created = Employee.objects.update_or_create(
                employee_id=emp_id,
                defaults={
                    'name': name,
                    'email': employee_email,
                    'department': department,
                },
            )

            if created:
                created_count += 1
            else:
                updated_count += 1

        imported_count = created_count + updated_count
        message = f"Successfully imported {imported_count} employee{'' if imported_count == 1 else 's'}."
        if skipped_rows:
            message += f" Skipped {len(skipped_rows)} row{'' if len(skipped_rows) == 1 else 's'}."

        return Response({
            "success": True,
            "message": message,
            "created": created_count,
            "updated": updated_count,
            "skipped": len(skipped_rows),
            "errors": skipped_rows,
        })

    @action(detail=True, methods=['get'], url_path='assigned-assets')
    def assigned_assets(self, request, pk=None):
        employee = self.get_object()
        assets = Asset.objects.filter(custodian=employee).select_related('custodian', 'department', 'super_category')
        serializer = AssetListSerializer(assets, many=True, context={'request': request})
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='unassign-all')
    @transaction.atomic
    def unassign_all(self, request, pk=None):
        if not request.user.is_superuser:
            return Response({"error": "Only admins can run employee offboarding."}, status=403)

        employee = self.get_object()
        ids = set(serializers.ListField(child=serializers.IntegerField(min_value=1), allow_empty=False).run_validation(request.data.get('asset_ids')))
        selected_assets = list(Asset.objects.select_for_update().filter(pk__in=ids, custodian=employee))
        if len(selected_assets) != len(ids):
            return Response({'error': 'Every selected asset must belong to this employee. Refresh and try again.'}, status=400)
        active_assignments = AssetAssignment.objects.filter(employee=employee, asset_id__in=ids, status='ASSIGNED').select_related('asset')
        returned_count = 0

        for assignment in active_assignments:
            assignment.mark_returned(returned_by=f"Offboarding by {request.user.username}", condition='Good')
            AssetHistory.objects.create(
                asset=assignment.asset,
                action='OFFBOARDING_RETURN',
                from_employee=employee,
                to_employee=None,
                remarks=f"Unassigned during offboarding by {request.user.username}."
            )
            returned_count += 1

        remaining_assets = Asset.objects.filter(custodian=employee, pk__in=ids)
        for asset in remaining_assets:
            asset.custodian = None
            asset.current_status = 'AVAILABLE'
            asset.save()
            AssetHistory.objects.create(
                asset=asset,
                action='OFFBOARDING_RETURN',
                from_employee=employee,
                to_employee=None,
                remarks=f"Unassigned during offboarding by {request.user.username}."
            )
            returned_count += 1

        return Response({"status": "Employee assets unassigned", "returned_count": returned_count})

class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.select_related('manager').all()
    serializer_class = DepartmentSerializer
    permission_classes = [IsAdminUserOrReadOnly]

class AssetActionRequestViewSet(viewsets.ModelViewSet):
    queryset = AssetActionRequest.objects.select_related(
        'asset', 'requester', 'target_employee', 'processed_by', 'submitted_by',
    ).order_by('-created_at')
    serializer_class = AssetActionRequestSerializer
    permission_classes = [permissions.IsAuthenticated, NotStockOnlyUser]

    def perform_create(self, serializer):
        serializer.save(status='PENDING', submitted_by=self.request.user)

    def update(self, request, *args, **kwargs):
        if self.get_object().status != 'PENDING':
            return Response({'error': 'Processed requests cannot be edited.'}, status=403)
        if {'status', 'processed_by', 'processed_at', 'admin_remarks', 'submitted_by'} & set(request.data):
            return Response({'error': 'Use the approval or rejection action to process a request.'}, status=403)
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        if self.get_object().status != 'PENDING':
            return Response({'error': 'Processed requests cannot be deleted.'}, status=403)
        return super().destroy(request, *args, **kwargs)

    def get_queryset(self):
        queryset = super().get_queryset()
        status = self.request.query_params.get('status')
        if status:
            queryset = queryset.filter(status=status)
        
        if not self.request.user.is_superuser:
            team_ids = _get_team_employee_ids(self.request.user)
            if team_ids:
                emp_filter = get_employee_filter(self.request.user, prefix='requester__')
                queryset = queryset.filter(
                    Q(requester_id__in=team_ids) |
                    Q(target_employee_id__in=team_ids) |
                    emp_filter
                )
            else:
                emp_filter = get_employee_filter(self.request.user, prefix='requester__')
                queryset = queryset.filter(emp_filter)
        return queryset

    def create(self, request, *args, **kwargs):
        if not request.data.get('requester'):
            requester = _get_employee_requester(request.user)
            if not requester:
                return Response({"error": "Employee profile not found for user."}, status=400)

            data = request.data.copy()
            data['requester'] = requester.id
            data['action_type'] = data.get('action_type') or 'ASSIGN'
            data['reason_for_request'] = data.get('reason_for_request') or data.get('remarks') or ''
            data['status'] = 'PENDING'
            serializer = self.get_serializer(data=data)
            serializer.is_valid(raise_exception=True)
            serializer.save(requester=requester, status='PENDING', submitted_by=request.user)
            return Response(serializer.data, status=201)

        requested_emp_id = request.data.get('requester')
        if requested_emp_id and not request.user.is_superuser:
            team_ids = _get_team_employee_ids(request.user)
            requested_emp_id = serializers.IntegerField(min_value=1).run_validation(requested_emp_id)
            if requested_emp_id not in team_ids:
                return Response({"error": "You do not have permission to submit requests for this employee."}, status=403)

        return super().create(request, *args, **kwargs)

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def approve(self, request, pk=None):
        if not request.user.is_superuser:
            return Response({"error": "Only admins can approve requests"}, status=403)
        
        req = AssetActionRequest.objects.select_for_update().get(pk=self.get_object().pk)
        if req.status != 'PENDING':
            return Response({"error": "Request is already processed"}, status=400)
        
        admin_remarks = request.data.get('admin_remarks', '')
        asset = Asset.objects.select_for_update().get(pk=req.asset_id) if req.asset_id else None
        
        # --- PERFORM THE ACTION ---
        try:
            if req.action_type == 'ADD':
                data = req.asset_data or {}
                miczon_id = data.get('miczon_id')
                
                if not miczon_id:
                    return Response({"error": "Miczon ID is missing in request data"}, status=400)
                
                if Asset.objects.filter(miczon_id=miczon_id).exists():
                    return Response({"error": f"Asset with Miczon ID {miczon_id} already exists"}, status=400)

                payload = dict(data)
                payload['super_category'] = payload.get('super_category') or req.super_category_id or SuperCategory.objects.get(code='it_assets').pk
                for field in ('custodian', 'department', 'purchase_date', 'purchase_price', 'sent_to_repair_date', 'expected_return_date'):
                    if payload.get(field) == '':
                        payload[field] = None
                proposed_asset = AssetDetailSerializer(data=payload)
                proposed_asset.is_valid(raise_exception=True)
                new_asset = proposed_asset.save()
                req.asset = new_asset
                asset = new_asset
                
                AssetHistory.objects.create(
                    asset=asset,
                    action="ADD",
                    remarks=f"Asset added to system via approval by {request.user.username}"
                )

            elif req.action_type == 'RETURN':
                if not asset:
                    return Response({"error": "No asset associated with this request"}, status=400)
                active_assignment = AssetAssignment.objects.filter(asset=asset, status='ASSIGNED').first()
                if active_assignment:
                    active_assignment.mark_returned(returned_by=f"Approved by {request.user.username}", condition='Good')
                else:
                    # Fallback if no active assignment found but request exists
                    asset.custodian = None
                    asset.current_status = 'AVAILABLE'
                    asset.save()
                
                AssetHistory.objects.create(
                    asset=asset,
                    action="RETURN",
                    remarks=f"Return request approved by {request.user.username}"
                )
        
            elif req.action_type == 'ASSIGN' or req.action_type == 'TRANSFER':
                if not asset:
                    if req.requested_device_type:
                        # Device-only requests are approvals to provision hardware; assignment happens once an asset is selected.
                        pass
                    else:
                        return Response({"error": "No asset associated with this request"}, status=400)
                elif not req.target_employee:
                    return Response({"error": "Target employee is missing in request"}, status=400)
                else:
                    from_employee = asset.custodian
                    to_employee = req.target_employee
                    
                    # Return current assignment if transfer or if already assigned
                    active_assignment = AssetAssignment.objects.filter(asset=asset, status='ASSIGNED').first()
                    if active_assignment:
                        active_assignment.mark_returned(returned_by=f"System (Prior to {req.action_type} Approval)", condition='Good')
                    
                    AssetAssignment.objects.create(
                        asset=asset,
                        employee=to_employee,
                        remarks=req.remarks,
                        status='ASSIGNED'
                    )
                    AssetHistory.objects.create(
                        asset=asset,
                        action=req.action_type,
                        from_employee=from_employee,
                        to_employee=to_employee,
                        remarks=req.remarks or f"{req.action_type} Approved by {request.user.username}"
                    )
            
            elif req.action_type == 'REPAIR':
                if not asset:
                    return Response({"error": "No asset associated with this request"}, status=400)
                
                active_assignment = AssetAssignment.objects.filter(asset=asset, status='ASSIGNED').first()
                if active_assignment:
                    active_assignment.mark_returned(returned_by=f"Repair Approved by {request.user.username}", condition='Broken')
                    
                asset.current_status = 'BROKEN'
                asset.maintenance_vendor = req.vendor
                asset.sent_to_repair_date = date.today()
                asset.expected_return_date = req.expected_return_date
                asset.save()
                
                AssetHistory.objects.create(
                    asset=asset,
                    action="REPAIR",
                    remarks=f"Repair Approved. Vendor: {req.vendor}. Info: {req.remarks}"
                )
        except Exception as e:
            transaction.set_rollback(True)
            logger.exception('Approval failed')
            return Response({"error": "Approval failed; no changes were applied."}, status=400)

        # Update Request Status
        req.status = 'APPROVED'
        req.admin_remarks = admin_remarks
        req.processed_at = timezone.now()
        req.processed_by = request.user
        req.save()
        
        return Response({"status": "Request approved and action performed"})

    @action(detail=True, methods=['post'])
    @transaction.atomic
    def reject(self, request, pk=None):
        if not request.user.is_superuser:
            return Response({"error": "Only admins can reject requests"}, status=403)
        
        req = AssetActionRequest.objects.select_for_update().get(pk=self.get_object().pk)
        if req.status != 'PENDING':
            return Response({"error": "Request is already processed"}, status=400)
            
        admin_remarks = request.data.get('admin_remarks', '')
        req.status = 'REJECTED'
        req.admin_remarks = admin_remarks
        req.processed_at = timezone.now()
        req.processed_by = request.user
        req.save()
        
        return Response({"status": "Request rejected"})

class HealthCheckSessionViewSet(viewsets.ModelViewSet):
    queryset = HealthCheckSession.objects.select_related('triggered_by', 'super_category').order_by('-created_at')
    serializer_class = HealthCheckSessionSerializer

    def get_permissions(self):
        if self.action in ('create', 'update', 'partial_update', 'destroy', 'trigger_global', 'close'):
            return [IsAdminUserOrReadOnly()]
        return [permissions.IsAuthenticated(), NotStockOnlyUser()]

    def perform_create(self, serializer):
        serializer.save(triggered_by=self.request.user)

    def update(self, request, *args, **kwargs):
        return Response({'error': 'Inspection sessions are immutable. Use Close to finish a session.'}, status=405)

    def destroy(self, request, *args, **kwargs):
        return Response({'error': 'Inspection history cannot be deleted.'}, status=405)

    def get_queryset(self):
        queryset = super().get_queryset().annotate(response_count=Count('responses'))
        super_category = self.request.query_params.get('super_category')
        if super_category and str(super_category).lower() != 'all':
            if str(super_category).isdigit():
                queryset = queryset.filter(super_category_id=super_category)
            else:
                queryset = queryset.filter(Q(super_category__code__iexact=super_category) | Q(super_category__name__iexact=super_category))

        if self.request.user.is_superuser:
            return queryset

        employee = _get_employee_requester(self.request.user)
        if not employee:
            return queryset.none()

        submitted_sessions = HealthCheckResponse.objects.filter(employee_id__in=_get_team_employee_ids(self.request.user)).values('session_id')
        return queryset.filter(Q(status='OPEN') | Q(id__in=submitted_sessions)).distinct()

    @action(detail=False, methods=['post'], url_path='trigger-global')
    def trigger_global(self, request):
        if not request.user.is_superuser:
            return Response({"error": "Only admins can start monthly inspections."}, status=403)

        super_cat_id_or_code = request.data.get('super_category')
        super_cat_obj = None
        if super_cat_id_or_code:
            if str(super_cat_id_or_code).isdigit():
                super_cat_obj = SuperCategory.objects.filter(id=super_cat_id_or_code).first()
            else:
                super_cat_obj = SuperCategory.objects.filter(Q(code__iexact=super_cat_id_or_code) | Q(name__iexact=super_cat_id_or_code)).first()
        
        if super_cat_id_or_code and str(super_cat_id_or_code).lower() != 'all' and not super_cat_obj:
            return Response({'error': 'Unknown inspection category.'}, status=400)
        if not super_cat_obj and str(super_cat_id_or_code).lower() != 'all':
            super_cat_obj = SuperCategory.objects.filter(code='it_assets').first()

        cat_prefix = super_cat_obj.name if super_cat_obj else "Hardware"
        title = request.data.get('title') or f"Monthly {cat_prefix} Inspection {timezone.now().date()}"
        session = HealthCheckSession.objects.create(title=title, super_category=super_cat_obj, triggered_by=request.user)
        serializer = self.get_serializer(session)

        assigned_qs = Asset.objects.filter(current_status='ASSIGNED', custodian__isnull=False)
        if super_cat_obj:
            assigned_qs = assigned_qs.filter(super_category=super_cat_obj)
        assigned_assets = assigned_qs.count()

        return Response({
            "status": f"Monthly inspection started for {cat_prefix}",
            "assigned_assets": assigned_assets,
            "session": serializer.data,
        }, status=201)

    @action(detail=True, methods=['post'], url_path='close')
    def close(self, request, pk=None):
        if not request.user.is_superuser:
            return Response({"error": "Only admins can close health checks."}, status=403)

        session = self.get_object()
        session.status = 'CLOSED'
        session.closed_at = timezone.now()
        session.save()
        return Response({"status": "Health check closed"})

    @action(detail=True, methods=['get'], url_path='responses')
    def responses(self, request, pk=None):
        session = self.get_object()
        responses = HealthCheckResponse.objects.filter(session=session).select_related(
            'employee', 'employee__department', 'asset', 'asset__department',
            'asset__super_category', 'session', 'session__super_category',
        )
        if not request.user.is_superuser:
            responses = responses.filter(employee_id__in=_get_team_employee_ids(request.user))
        serializer = HealthCheckResponseSerializer(responses, many=True)
        return Response(serializer.data)

    @action(detail=True, methods=['get'], url_path='pending-assets')
    def pending_assets(self, request, pk=None):
        session = self.get_object()
        employee = _get_employee_requester(request.user)

        requested_emp_param = request.query_params.get('employee')
        if requested_emp_param:
            requested_emp_param = serializers.IntegerField(min_value=1).run_validation(requested_emp_param)
            team_ids = _get_team_employee_ids(request.user)
            if request.user.is_superuser or requested_emp_param in team_ids:
                employee = Employee.objects.filter(id=requested_emp_param).first()
            else:
                return Response({'error': 'You cannot inspect this employee.'}, status=403)

        if not employee:
            return Response([])

        responded_assets = HealthCheckResponse.objects.filter(
            session=session,
            employee=employee
        ).values_list('asset_id', flat=True)
        assets = [a for a in session_assets(session) if a.custodian_id == employee.pk and a.pk not in responded_assets]
        serializer = AssetListSerializer(assets, many=True, context={'request': request})
        return Response(serializer.data)

class HealthCheckResponseViewSet(viewsets.ModelViewSet):
    http_method_names = ['get', 'post', 'head', 'options']
    queryset = HealthCheckResponse.objects.all().select_related(
        'session', 'session__super_category', 'employee', 'employee__department',
        'asset', 'asset__department', 'asset__super_category',
    ).order_by('-submitted_at')
    serializer_class = HealthCheckResponseSerializer
    permission_classes = [permissions.IsAuthenticated, NotStockOnlyUser]

    def get_queryset(self):
        queryset = super().get_queryset()
        asset = self.request.query_params.get('asset')
        session = self.request.query_params.get('session')
        if asset:
            queryset = queryset.filter(asset_id=asset)
        if session:
            queryset = queryset.filter(session_id=session)

        if not self.request.user.is_superuser:
            team_ids = _get_team_employee_ids(self.request.user)
            if team_ids:
                queryset = queryset.filter(employee_id__in=team_ids)
            else:
                employee = _get_employee_requester(self.request.user)
                queryset = queryset.filter(employee=employee)

        return queryset

    def create(self, request, *args, **kwargs):
        employee = _get_employee_requester(request.user)
        if not employee:
            return Response({"error": "Employee profile not found for user."}, status=400)

        data = request.data.copy()
        data['employee'] = employee.id
        asset_id = data.get('asset')
        session_id = serializers.IntegerField(min_value=1).run_validation(data.get('session'))

        session = HealthCheckSession.objects.filter(id=session_id, status='OPEN').first()
        if not session:
            return Response({"error": "This health check session is not open."}, status=400)
        asset_id = serializers.IntegerField(min_value=1).run_validation(asset_id)
        if not any(a.pk == asset_id and a.custodian_id == employee.pk for a in session_assets(session)):
            return Response({'error': 'This asset is not assigned to you for this inspection.'}, status=403)

        serializer = self.get_serializer(data=data)
        serializer.is_valid(raise_exception=True)
        serializer.save(employee=employee)
        if asset_id:
            Asset.objects.filter(id=asset_id).update(last_inspection_date=timezone.now().date())
        return Response(serializer.data, status=201)

    @action(detail=False, methods=['post'], url_path='bulk-submit')
    def bulk_submit(self, request):
        target_emp_id = request.data.get('employee')
        if target_emp_id:
            target_emp_id = serializers.IntegerField(min_value=1).run_validation(target_emp_id)
            team_ids = _get_team_employee_ids(request.user)
            if request.user.is_superuser or int(target_emp_id) in team_ids:
                employee = Employee.objects.filter(id=target_emp_id).first()
                if not employee:
                    return Response({"error": "Target employee profile not found."}, status=404)
            else:
                return Response({"error": "You do not have permission to submit inspections for this employee."}, status=403)
        else:
            employee = _get_employee_requester(request.user)
            if not employee:
                return Response({"error": "Employee profile not found for user."}, status=400)

        session_id = serializers.IntegerField(min_value=1).run_validation(request.data.get('session'))
        responses = serializers.ListField(child=serializers.DictField(), allow_empty=False).run_validation(request.data.get('responses'))
        if not responses:
            return Response({"error": "No health check responses were provided."}, status=400)

        session = HealthCheckSession.objects.filter(id=session_id, status='OPEN').first()
        if not session:
            return Response({"error": "This health check session is not open."}, status=400)

        asset_ids = [response.get('asset') for response in responses if response.get('asset')]
        if len(asset_ids) != len(responses):
            return Response({"error": "Every health check response must include an asset."}, status=400)

        asset_ids = serializers.ListField(child=serializers.IntegerField(min_value=1)).run_validation(asset_ids)
        assigned_asset_ids = {a.pk for a in session_assets(session) if a.custodian_id == employee.pk}
        if len(set(asset_ids)) != len(asset_ids) or not set(asset_ids).issubset(assigned_asset_ids):
            return Response({'error': 'Every asset must belong to this employee in this inspection, without duplicates.'}, status=403)

        saved_responses = []
        with transaction.atomic():
            for response in responses:
                data = dict(response)
                data.update(session=session.id, employee=employee.id)
                existing_response = HealthCheckResponse.objects.filter(
                    session=session,
                    employee=employee,
                    asset_id=response.get('asset')
                ).first()
                serializer = self.get_serializer(existing_response, data=data)
                serializer.is_valid(raise_exception=True)
                health_response = serializer.save(employee=employee)
                if response.get('asset'):
                    Asset.objects.filter(id=response.get('asset')).update(last_inspection_date=timezone.now().date())
                saved_responses.append(health_response)

        serializer = self.get_serializer(saved_responses, many=True)
        return Response(serializer.data, status=201)

class ReportsViewSet(viewsets.ViewSet):
    permission_classes = [permissions.IsAuthenticated, NotStockOnlyUser]
    HEALTH_EXPORT_COLUMNS = [
        'Employee Name', 'Employee Code', 'Department', 'Asset Miczon ID', 'Asset Name', 'Category',
        'Inspection Findings',
        'Screen Condition', 'Battery Life', 'Physical Condition', 'Power/Boot Status',
        'Ports/Connectors', 'Network Functionality', 'Asset Tag Status', 'Performance Rating',
        'Comments', 'Submitted At'
    ]

    PENDING_ASSET_COLUMNS = [
        'Employee Name', 'Employee Code', 'Email', 'Department', 'Asset Miczon ID', 'Asset Name', 'Category'
    ]

    PENDING_EMPLOYEE_COLUMNS = [
        'Employee Name', 'Employee Code', 'Email', 'Department', 'Pending Assets', 'Asset Details'
    ]

    DEPARTMENT_COLUMNS = ['Department', 'Target Assets', 'Completed Assets', 'Pending Assets', 'Completion %']

    def _get_health_session(self, session_id):
        if not session_id:
            return None, Response({"error": "Session ID is required"}, status=400)
        session_id = serializers.IntegerField(min_value=1).run_validation(session_id)
        session = HealthCheckSession.objects.filter(id=session_id).first()
        if not session:
            return None, Response({"error": "Inspection period was not found."}, status=404)
        return session, None

    def _get_health_export_dataset(self, request, session):
        target_assets = session_assets(session)
        if not request.user.is_superuser:
            team = set(_get_team_employee_ids(request.user))
            target_assets = [a for a in target_assets if a.custodian_id in team]
        department = request.query_params.get('department', '').strip()
        search = request.query_params.get('search', '').strip().lower()
        if department:
            target_assets = [a for a in target_assets if self._department_name_for_asset(a) == department]
        if search:
            target_assets = [a for a in target_assets if search in ' '.join([
                a.name, a.miczon_id, a.category, a.custodian.name, a.custodian.employee_id,
                self._department_name_for_asset(a)]).lower()]
        owners = {a.pk: a.custodian_id for a in target_assets}
        responses = [r for r in HealthCheckResponse.objects.filter(
            session=session, asset_id__in=owners).select_related(
                'employee__department', 'asset__department', 'asset__super_category', 'session__super_category')
            if owners.get(r.asset_id) == r.employee_id]
        responded_ids = {r.asset_id for r in responses}
        historical_assets = {asset.pk: asset for asset in target_assets}
        for response in responses:
            response.asset = historical_assets[response.asset_id]
        return target_assets, responses, [a for a in target_assets if a.pk not in responded_ids]

    def _department_name_for_asset(self, asset):
        if hasattr(asset, 'inspection_department'):
            return asset.inspection_department
        if asset.custodian and asset.custodian.department:
            return asset.custodian.department.name
        if asset.department:
            return asset.department.name
        return "Unassigned"

    def _department_name_for_response(self, response):
        if hasattr(response.asset, 'inspection_department'):
            return response.asset.inspection_department
        if response.employee and response.employee.department:
            return response.employee.department.name
        if response.asset and response.asset.department:
            return response.asset.department.name
        return "Unassigned"

    def _health_response_rows(self, responses):
        rows = []
        for r in responses:
            relevant_fields = {field['name'] for field in inspection_fields(r.asset, r.session)}
            rows.append({
                'Employee Name': r.employee.name,
                'Employee Code': r.employee.employee_id,
                'Department': self._department_name_for_response(r),
                'Asset Miczon ID': r.asset.miczon_id,
                'Asset Name': r.asset.name,
                'Category': r.asset.category,
                'Inspection Findings': '; '.join(f"{f['label']}: {f['options'].get(getattr(r, f['name']), getattr(r, f['name']) or 'Not recorded')}" for f in inspection_fields(r.asset, r.session)),
                'Screen Condition': r.get_screen_condition_display() if 'screen_condition' in relevant_fields else '',
                'Battery Life': r.get_battery_life_display() if 'battery_life' in relevant_fields else '',
                'Physical Condition': r.get_physical_condition_display() if 'physical_condition' in relevant_fields else '',
                'Power/Boot Status': r.get_power_boot_status_display() if 'power_boot_status' in relevant_fields else '',
                'Ports/Connectors': r.get_ports_connectors_display() if 'ports_connectors' in relevant_fields else '',
                'Network Functionality': r.get_network_functionality_display() if 'network_functionality' in relevant_fields else '',
                'Asset Tag Status': r.get_asset_tag_status_display(),
                'Performance Rating': r.performance_rating,
                'Comments': r.comments,
                'Submitted At': timezone.localtime(r.submitted_at).strftime('%Y-%m-%d %H:%M:%S') if r.submitted_at else ""
            })
        return rows

    def _pending_asset_rows(self, pending_assets):
        return [{
            'Employee Name': asset.custodian.name,
            'Employee Code': asset.custodian.employee_id,
            'Email': asset.custodian.email,
            'Department': self._department_name_for_asset(asset),
            'Asset Miczon ID': asset.miczon_id,
            'Asset Name': asset.name,
            'Category': asset.category or 'Uncategorized',
        } for asset in pending_assets if asset.custodian]

    def _pending_employee_rows(self, pending_assets):
        employees = {}
        for asset in pending_assets:
            if not asset.custodian:
                continue
            row = employees.setdefault(asset.custodian_id, {
                'Employee Name': asset.custodian.name,
                'Employee Code': asset.custodian.employee_id,
                'Email': asset.custodian.email,
                'Department': self._department_name_for_asset(asset),
                'Pending Assets': 0,
                'Asset Details': [],
            })
            row['Pending Assets'] += 1
            row['Asset Details'].append(f"{asset.name} ({asset.miczon_id})")
        rows = []
        for row in employees.values():
            row = row.copy()
            row['Asset Details'] = ', '.join(row['Asset Details'])
            rows.append(row)
        return sorted(rows, key=lambda row: (-row['Pending Assets'], row['Employee Name']))

    def _department_rows(self, target_assets, responses):
        responded_asset_ids = {response.asset_id for response in responses}
        departments = {}
        for asset in target_assets:
            name = self._department_name_for_asset(asset)
            row = departments.setdefault(name, {
                'Department': name,
                'Target Assets': 0,
                'Completed Assets': 0,
                'Pending Assets': 0,
                'Completion %': 0,
            })
            row['Target Assets'] += 1
            if asset.id in responded_asset_ids:
                row['Completed Assets'] += 1
            else:
                row['Pending Assets'] += 1
        for row in departments.values():
            row['Completion %'] = round((row['Completed Assets'] / row['Target Assets']) * 100) if row['Target Assets'] else 0
        return sorted(departments.values(), key=lambda row: row['Department'])

    def _summary_rows(self, session, target_assets, responses, pending_assets):
        critical_count = sum(1 for response in responses if response.performance_rating < 3)
        completed_count = len({response.asset_id for response in responses})
        total_targets = len(target_assets)
        return [
            {'Metric': 'Inspection Period', 'Value': session.title},
            {'Metric': 'Created At', 'Value': timezone.localtime(session.created_at).strftime('%Y-%m-%d %H:%M:%S') if session.created_at else ''},
            {'Metric': 'Status', 'Value': session.get_status_display()},
            {'Metric': 'Target Assets', 'Value': total_targets},
            {'Metric': 'Completed Assets', 'Value': completed_count},
            {'Metric': 'Pending Assets', 'Value': len(pending_assets)},
            {'Metric': 'Pending Employees', 'Value': len({asset.custodian_id for asset in pending_assets if asset.custodian_id})},
            {'Metric': 'Critical Alerts', 'Value': critical_count},
            {'Metric': 'Completion %', 'Value': round((completed_count / total_targets) * 100) if total_targets else 0},
        ]

    def _write_health_export(self, sheets):
        output = BytesIO()
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            for sheet_name, columns, rows in sheets:
                df = pd.DataFrame(rows, columns=columns)
                df.to_excel(writer, index=False, sheet_name=sheet_name)
                worksheet = writer.sheets[sheet_name]
                for cell in worksheet[1]:
                    cell.font = Font(bold=True, color='FFFFFF')
                    cell.fill = PatternFill(start_color='0F766E', end_color='0F766E', fill_type='solid')
                    cell.alignment = Alignment(horizontal='center')
                for column_cells in worksheet.columns:
                    values = [str(cell.value or '') for cell in column_cells]
                    width = min(max(len(value) for value in values) + 2, 45)
                    worksheet.column_dimensions[column_cells[0].column_letter].width = width
                worksheet.freeze_panes = 'A2'
                worksheet.auto_filter.ref = worksheet.dimensions
        output.seek(0)
        return output

    def _health_export_response(self, output, filename):
        response = HttpResponse(
            output.read(),
            content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        )
        response['Content-Disposition'] = f'attachment; filename="{filename}"'
        return response

    """
    Reporting and Analytics ViewSet
    """

    @action(detail=False, methods=['get'], url_path='dashboard-stats')
    def dashboard_stats(self, request):
        queryset = Asset.objects.all()
        super_category = request.query_params.get('super_category')
        if super_category and str(super_category).lower() != 'all':
            if str(super_category).isdigit():
                queryset = queryset.filter(super_category_id=super_category)
            else:
                queryset = queryset.filter(Q(super_category__code__iexact=super_category) | Q(super_category__name__iexact=super_category))

        if not (request.user.is_superuser or request.user.is_staff):
            emp_filter = get_employee_filter(request.user, prefix='custodian__')
            queryset = queryset.filter(emp_filter)

        stats = queryset.aggregate(
            total_assets=Count('id'),
            total_assigned=Count('id', filter=Q(current_status='ASSIGNED')),
            total_unassigned=Count('id', filter=Q(current_status='AVAILABLE')),
            total_repair=Count('id', filter=Q(current_status='BROKEN'))
        )
        return Response(stats)

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        assets = Asset.objects.all()
        super_category = request.query_params.get('super_category')
        if super_category and str(super_category).lower() != 'all':
            if str(super_category).isdigit():
                assets = assets.filter(super_category_id=super_category)
            else:
                assets = assets.filter(Q(super_category__code__iexact=super_category) | Q(super_category__name__iexact=super_category))

        if not (request.user.is_superuser or request.user.is_staff):
            emp_filter = get_employee_filter(request.user, prefix='custodian__')
            assets = assets.filter(emp_filter)

        category_rows = assets.values('category').annotate(count=Count('id')).order_by('category')
        active_requests = AssetActionRequest.objects.filter(status='PENDING')
        open_sessions = HealthCheckSession.objects.filter(status='OPEN')

        if super_category and str(super_category).lower() != 'all':
            if str(super_category).isdigit():
                # Include requests where super_category matches directly, OR via linked asset,
                # OR where neither is set (e.g. ADD requests with no asset yet)
                active_requests = active_requests.filter(
                    Q(super_category_id=super_category) |
                    Q(asset__super_category_id=super_category) |
                    Q(super_category__isnull=True, asset__isnull=True)
                )
                open_sessions = open_sessions.filter(super_category_id=super_category)
            else:
                super_cat_obj = SuperCategory.objects.filter(
                    Q(code__iexact=super_category) | Q(name__iexact=super_category)
                ).first()
                active_requests = active_requests.filter(
                    Q(super_category__code__iexact=super_category) |
                    Q(asset__super_category__code__iexact=super_category) |
                    Q(super_category__isnull=True, asset__isnull=True)
                )
                if super_cat_obj:
                    open_sessions = open_sessions.filter(super_category=super_cat_obj)

        # Pending health checks = number of assigned assets not yet responded to in any open session
        if open_sessions.exists():
            open_session_ids = list(open_sessions.values_list('id', flat=True))
            target_assets_qs = Asset.objects.filter(current_status='ASSIGNED', custodian__isnull=False)
            if super_category and str(super_category).lower() != 'all' and not str(super_category).isdigit():
                super_cat_obj = SuperCategory.objects.filter(
                    Q(code__iexact=super_category) | Q(name__iexact=super_category)
                ).first()
                if super_cat_obj:
                    target_assets_qs = target_assets_qs.filter(super_category=super_cat_obj)
            elif super_category and str(super_category).isdigit():
                target_assets_qs = target_assets_qs.filter(super_category_id=super_category)

            if not (request.user.is_superuser or request.user.is_staff):
                employee = _get_employee_requester(request.user)
                if employee:
                    target_assets_qs = target_assets_qs.filter(custodian=employee)
                else:
                    target_assets_qs = target_assets_qs.none()

            responded_asset_ids = HealthCheckResponse.objects.filter(
                session_id__in=open_session_ids
            ).values_list('asset_id', flat=True).distinct()
            pending_asset_count = target_assets_qs.exclude(id__in=responded_asset_ids).count()
        else:
            pending_asset_count = 0

        if not (request.user.is_superuser or request.user.is_staff):
            employee = _get_employee_requester(request.user)
            active_requests = active_requests.filter(requester=employee)

        return Response({
            "total_devices": assets.count(),
            "laptops": assets.filter(category__icontains='laptop').count(),
            "mobiles": assets.filter(Q(category__icontains='mobile') | Q(category__icontains='phone')).count(),
            "accessories": assets.filter(category__icontains='accessor').count(),
            "assigned": assets.filter(current_status='ASSIGNED').count(),
            "available": assets.filter(current_status='AVAILABLE').count(),
            "repair": assets.filter(current_status='BROKEN').count(),
            "active_requests": active_requests.count(),
            "pending_health_checks": pending_asset_count,
            "category_breakdown": list(category_rows),
        })

    @action(detail=False, methods=['get'], url_path='category-breakdown')
    def category_breakdown(self, request):
        queryset = Asset.objects.all()
        if not request.user.is_superuser:
            emp_filter = get_employee_filter(request.user, prefix='custodian__')
            queryset = queryset.filter(emp_filter)

        # Return asset counts grouped by Category.
        data = queryset.values('category').annotate(
            count=Count('id'),
            assigned=Count('id', filter=Q(current_status='ASSIGNED')),
            available=Count('id', filter=Q(current_status='AVAILABLE'))
        ).order_by('category')
        
        return Response(data)

    @action(detail=False, methods=['get'], url_path='health-compliance')
    def health_compliance(self, request):
        sessions = HealthCheckSession.objects.all().annotate(response_count=Count('responses')).order_by('-created_at')
        super_category = request.query_params.get('super_category')
        if super_category and str(super_category).lower() != 'all':
            if str(super_category).isdigit():
                sessions = sessions.filter(super_category_id=super_category)
            else:
                sessions = sessions.filter(Q(super_category__code__iexact=super_category) | Q(super_category__name__iexact=super_category))

        session_id = request.query_params.get('session')
        session = sessions.filter(id=session_id).first() if session_id else sessions.filter(status='OPEN').first()
        if not session and not session_id and not super_category:
            session = HealthCheckSession.objects.all().order_by('-created_at').first()

        if not session:
            return Response({
                "session": None,
                "summary": {
                    "target_assets": 0,
                    "completed_assets": 0,
                    "pending_assets": 0,
                    "pending_employees": 0,
                    "completion_rate": 0,
                    "critical_alerts": 0,
                },
                "pending_by_employee": [],
                "department_summary": [],
                "responses": [],
            })

        target_assets, responses, pending_assets = self._get_health_export_dataset(request, session)
        responded_asset_ids = {response.asset_id for response in responses}

        pending_by_employee = {}
        for asset in pending_assets:
            employee = asset.custodian
            if not employee:
                continue
            row = pending_by_employee.setdefault(employee.id, {
                "employee_id": employee.id,
                "employee_name": employee.name,
                "employee_code": employee.employee_id,
                "email": employee.email,
                "department": employee.department.name if employee.department else (asset.department.name if asset.department else "Unassigned"),
                "pending_count": 0,
                "assets": [],
            })
            row["pending_count"] += 1
            row["assets"].append({
                "id": asset.id,
                "name": asset.name,
                "miczon_id": asset.miczon_id,
                "category": asset.category,
            })

        department_summary = {}
        for asset in target_assets:
            department_name = self._department_name_for_asset(asset)
            row = department_summary.setdefault(department_name, {"department": department_name, "target": 0, "completed": 0, "pending": 0})
            row["target"] += 1
            if asset.id in responded_asset_ids:
                row["completed"] += 1
            else:
                row["pending"] += 1

        total_targets = len(target_assets)
        completed_assets = len(responded_asset_ids)
        completion_rate = round((completed_assets / total_targets) * 100) if total_targets else 0

        return Response({
            "session": HealthCheckSessionSerializer(session).data,
            "summary": {
                "target_assets": total_targets,
                "completed_assets": completed_assets,
                "pending_assets": max(total_targets - completed_assets, 0),
                "pending_employees": len(pending_by_employee),
                "completion_rate": completion_rate,
                "critical_alerts": sum(r.performance_rating < 3 for r in responses),
            },
            "pending_by_employee": sorted(pending_by_employee.values(), key=lambda row: (-row["pending_count"], row["employee_name"])),
            "department_summary": sorted(department_summary.values(), key=lambda row: row["department"]),
            "responses": HealthCheckResponseSerializer(responses, many=True).data,
        })

    @action(detail=False, methods=['get'], url_path='export-health-responses')
    def export_health_responses(self, request):
        if not request.user.is_superuser:
            return Response({"error": "Only admins can export reports."}, status=403)

        session_id = request.query_params.get('session')
        session, error_response = self._get_health_session(session_id)
        if error_response:
            return error_response

        report_type = request.query_params.get('type', 'all').strip() or 'all'
        allowed_report_types = {'all', 'completion', 'pending-assets', 'pending-employees', 'critical'}
        if report_type not in allowed_report_types:
            return Response({"error": "Unsupported export type."}, status=400)

        target_assets, responses, pending_assets = self._get_health_export_dataset(request, session)
        all_response_rows = self._health_response_rows(responses)
        critical_rows = self._health_response_rows([response for response in responses if response.performance_rating < 3])
        pending_asset_rows = self._pending_asset_rows(pending_assets)
        pending_employee_rows = self._pending_employee_rows(pending_assets)
        department_rows = self._department_rows(target_assets, responses)

        export_map = {
            'completion': [('Department Completion', self.DEPARTMENT_COLUMNS, department_rows)],
            'pending-assets': [('Pending Assets', self.PENDING_ASSET_COLUMNS, pending_asset_rows)],
            'pending-employees': [('Pending Employees', self.PENDING_EMPLOYEE_COLUMNS, pending_employee_rows)],
            'critical': [('Critical Alerts', self.HEALTH_EXPORT_COLUMNS, critical_rows)],
        }
        sheets = export_map.get(report_type)
        if sheets is None:
            sheets = [
                ('Summary', ['Metric', 'Value'], self._summary_rows(session, target_assets, responses, pending_assets)),
                ('Department Completion', self.DEPARTMENT_COLUMNS, department_rows),
                ('Pending Assets', self.PENDING_ASSET_COLUMNS, pending_asset_rows),
                ('Pending Employees', self.PENDING_EMPLOYEE_COLUMNS, pending_employee_rows),
                ('Critical Alerts', self.HEALTH_EXPORT_COLUMNS, critical_rows),
                ('Submitted Inspections', self.HEALTH_EXPORT_COLUMNS, all_response_rows),
            ]

        output = self._write_health_export(sheets)
        safe_report_type = report_type.replace('-', '_')
        return self._health_export_response(output, f'health_report_{safe_report_type}_{session_id}.xlsx')

    @action(detail=False, methods=['get'], url_path='custom-export')
    def custom_export(self, request):
        # OPTIMIZATION: Eager load relationships
        queryset = Asset.objects.all().select_related('custodian', 'department').prefetch_related(
            'history', 'assignments', 'inspectionlog_set'
        )
        
        # Filtering parameters
        dept_id = request.query_params.get('department')
        location = request.query_params.get('location') # Assuming this maps to Floor or similar
        category = request.query_params.get('category')
        status = request.query_params.get('status')

        if dept_id:
            queryset = queryset.filter(department_id=dept_id)
        
        if location:
            # Assuming location filters by Department Floor as there is no specific Location model
            queryset = queryset.filter(department__floor__icontains=location)
        
        if category:
            queryset = queryset.filter(category__icontains=category)

        if status:
            queryset = queryset.filter(current_status=status)

        # Owner restricted export
        if not request.user.is_superuser:
            emp_filter = get_employee_filter(request.user, prefix='custodian__')
            queryset = queryset.filter(emp_filter)

        serializer = AssetSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)

# --- EXCEL UPLOAD LOGIC ---
class UploadAssetsView(APIView):
    parser_classes = (MultiPartParser, FormParser)
    permission_classes = [permissions.IsAdminUser]

    def post(self, request, *args, **kwargs):
        # Legacy upload now uses the same preview/commit workflow as the UI.
        # Preview performs no writes; commit validated rows via /assets/bulk-commit/.
        return AssetViewSet().import_assets(request)
