from rest_framework import viewsets
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.parsers import MultiPartParser, FormParser
from .models import Asset, Employee, Department, AssetHistory, AssetAssignment, InspectionLog
from .serializers import AssetSerializer, EmployeeSerializer, DepartmentSerializer, AssetAssignmentSerializer, InspectionLogSerializer, AssetListSerializer, AssetDetailSerializer
from rest_framework.decorators import action
from django.db.models import Count, Q
import pandas as pd
import uuid  # <--- Added this to generate unique IDs
from datetime import date
from rest_framework.pagination import PageNumberPagination

# --- PAGINATION ---
class StandardResultsSetPagination(PageNumberPagination):
    page_size = 50
    page_size_query_param = 'page_size'
    max_page_size = 100

# --- VIEWSETS ---
class AssetAssignmentViewSet(viewsets.ModelViewSet):
    queryset = AssetAssignment.objects.all().order_by('-assigned_date')
    serializer_class = AssetAssignmentSerializer

class InspectionLogViewSet(viewsets.ModelViewSet):
    queryset = InspectionLog.objects.all().order_by('-date')
    serializer_class = InspectionLogSerializer

class AssetViewSet(viewsets.ModelViewSet):
    queryset = Asset.objects.all().order_by('-created_at')
    serializer_class = AssetDetailSerializer  # Default for create/update
    pagination_class = StandardResultsSetPagination

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
        queryset = Asset.objects.all().select_related('custodian', 'department')
        
        # Prefetch assignments for list views (needed for active_assignment_id)
        if self.action in ['list', 'retrieve']:
            queryset = queryset.prefetch_related('assignments')
        
        # Only prefetch heavy relations for detail views
        if self.action == 'retrieve':
            queryset = queryset.prefetch_related('history', 'inspectionlog_set')
        
        queryset = queryset.order_by('-created_at')
        
        # Filter parameters
        custodian = self.request.query_params.get('custodian')
        department = self.request.query_params.get('department')
        status = self.request.query_params.get('status')
        category = self.request.query_params.get('category')
        search = self.request.query_params.get('search')
        
        if custodian:
            queryset = queryset.filter(custodian_id=custodian)
        if department:
            queryset = queryset.filter(department_id=department)
        if status:
            queryset = queryset.filter(current_status=status)
        if category:
            queryset = queryset.filter(category__iexact=category)
        if search:
            # Search across multiple fields
            queryset = queryset.filter(
                Q(miczon_id__icontains=search) |
                Q(name__icontains=search) |
                Q(custodian__name__icontains=search) |
                Q(category__icontains=search)
            )
        
        return queryset

    def perform_update(self, serializer):
        instance = self.get_object()
        old_custodian = instance.custodian
        updated_asset = serializer.save()
        
        if updated_asset.custodian != old_custodian:
            action = 'ASSIGN' if updated_asset.custodian else 'RETURN'
            AssetHistory.objects.create(
                asset=updated_asset, action=action,
                from_employee=old_custodian, to_employee=updated_asset.custodian,
                remarks=f"Status changed to {updated_asset.current_status}"
            )

    @action(detail=True, methods=['post'])
    def transfer(self, request, pk=None):
        asset = self.get_object()
        to_employee_id = request.data.get('to_employee_id')
        remarks = request.data.get('remarks', 'Direct Transfer')
        
        try:
            to_employee = Employee.objects.get(pk=to_employee_id)
        except Employee.DoesNotExist:
            return Response({"error": "Employee not found"}, status=400)

        # 1. Find current active assignment
        active_assignment = AssetAssignment.objects.filter(asset=asset, status='ASSIGNED').first()
        from_employee = asset.custodian
        
        if active_assignment:
            active_assignment.mark_returned(returned_by='Transfer Action', condition='Good')
        
        # 2. Create new assignment
        AssetAssignment.objects.create(
            asset=asset,
            employee=to_employee,
            remarks=remarks,
            status='ASSIGNED'
        )
        
        # 3. Log history
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
        
        # 1. Auto-return if assigned
        active_assignment = AssetAssignment.objects.filter(asset=asset, status='ASSIGNED').first()
        if active_assignment:
            active_assignment.mark_returned(returned_by='Repair Action', condition='Broken')
            
        # 2. Update Asset Status and Maintenance Info
        asset.current_status = 'BROKEN'
        asset.maintenance_vendor = vendor
        asset.sent_to_repair_date = date.today()
        asset.expected_return_date = expected_return
        asset.save()
        
        # 3. Log history
        AssetHistory.objects.create(
            asset=asset,
            action="REPAIR",
            remarks=f"Sent to {vendor}. Issue: {issue}"
        )
        
        return Response({"status": "Asset sent to repair"})

    @action(detail=True, methods=['post'])
    def return_from_repair(self, request, pk=None):
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

    def get_queryset(self):
        queryset = Employee.objects.all()
        department = self.request.query_params.get('department')
        if department:
            queryset = queryset.filter(department_id=department)
        return queryset

class DepartmentViewSet(viewsets.ModelViewSet):
    queryset = Department.objects.all()
    serializer_class = DepartmentSerializer

class ReportsViewSet(viewsets.ViewSet):
    """
    Reporting and Analytics ViewSet
    """

    @action(detail=False, methods=['get'], url_path='dashboard-stats')
    def dashboard_stats(self, request):
        stats = Asset.objects.aggregate(
            total_assets=Count('id'),
            total_assigned=Count('id', filter=Q(current_status='ASSIGNED')),
            total_unassigned=Count('id', filter=Q(current_status='AVAILABLE')),
            total_repair=Count('id', filter=Q(current_status='BROKEN') | Q(current_status='IN_REPAIR'))
        )
        return Response(stats)

    @action(detail=False, methods=['get'], url_path='category-breakdown')
    def category_breakdown(self, request):
        # Return asset counts grouped by Category.
        data = Asset.objects.values('category').annotate(
            count=Count('id'),
            assigned=Count('id', filter=Q(current_status='ASSIGNED')),
            available=Count('id', filter=Q(current_status='AVAILABLE'))
        ).order_by('category')
        
        return Response(data)

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

        serializer = AssetSerializer(queryset, many=True, context={'request': request})
        return Response(serializer.data)

# --- EXCEL UPLOAD LOGIC ---
class UploadAssetsView(APIView):
    parser_classes = (MultiPartParser, FormParser)

    def post(self, request, *args, **kwargs):
        file_obj = request.FILES['file']
        try:
            # 1. Read File
            if file_obj.name.endswith('.csv'):
                df = pd.read_csv(file_obj)
            else:
                df = pd.read_excel(file_obj)

            df.columns = df.columns.str.strip()
            print("COLUMNS FOUND:", df.columns.tolist())

            count = 0
            for index, row in df.iterrows():
                # A. Get Miczon ID (Asset Tag)
                m_id = str(row.get('Miczon ID', row.get('Mic ID', row.get('Serial No', '')))).strip()
                if not m_id or m_id.lower() == 'nan':
                    continue 

                # B. Handle Department
                dept_name = str(row.get('Department', 'General')).strip()
                department, _ = Department.objects.get_or_create(name=dept_name)

                # C. Handle Custodian (SAFE METHOD)
                cust_name = str(row.get('Custodian', row.get('User', ''))).strip()
                custodian = None
                
                if cust_name and cust_name.lower() != 'nan':
                    # 1. Try to find existing employee by name
                    custodian = Employee.objects.filter(name=cust_name).first()
                    
                    # 2. If not found, create a new one with a RANDOM UNIQUE ID
                    if not custodian:
                        unique_emp_id = f"EMP-{uuid.uuid4().hex[:6].upper()}" # e.g., EMP-9A4F12
                        custodian = Employee.objects.create(
                            name=cust_name,
                            employee_id=unique_emp_id,
                            department=department
                        )

                # D. Save Asset
                Asset.objects.update_or_create(
                    miczon_id=m_id,
                    defaults={
                        'name': row.get('Device Name', row.get('Device', 'Unknown Device')),
                        'category': row.get('Categary', ''), 
                        'specifications': row.get('Specifications', ''),
                        'remarks': row.get('Remarks / Notes', ''),
                        'department': department,
                        'custodian': custodian,
                        'current_status': 'ASSIGNED' if custodian else 'AVAILABLE'
                    }
                )
                count += 1
            
            return Response({"status": "success", "message": f"Successfully imported {count} assets!"})

        except Exception as e:
            print("--------------------------------------------------")
            print("CRITICAL UPLOAD ERROR:", e)
            print("--------------------------------------------------")
            return Response({"status": "error", "message": f"Error: {str(e)}"}, status=400)
