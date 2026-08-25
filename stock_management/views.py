from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from django.utils import timezone
from .models import StockCategory, StockProduct, StockTransaction
from .serializers import StockCategorySerializer, StockProductSerializer, StockTransactionSerializer


class IsAdminUserOrReadOnly(permissions.BasePermission):
    """Any authenticated user may read; only superusers may create/update/delete."""
    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user.is_superuser)

# Seed database definitions for consistency on first load
PRODUCTS_DB = [
    {
        'code': 'CON-USB-01', 
        'name': 'Dell Wireless Keyboard & Mouse Combo', 
        'category': 'Peripherals', 
        'description': 'Standard office wireless keyboard and mouse combo with USB receiver.', 
        'qty': 45, 
        'reorder': 10, 
    },
    {
        'code': 'CON-CAB-05', 
        'name': 'HDMI to USB-C Adapter Cable (2m)', 
        'category': 'Cables & Adapters', 
        'description': 'Premium braided high-speed HDMI to USB-C cable for external monitors.', 
        'qty': 8, 
        'reorder': 15, 
    },
    {
        'code': 'CON-BAT-09', 
        'name': 'Duracell AA Batteries (24 Pack)', 
        'category': 'Power', 
        'description': 'Long-lasting alkaline AA batteries for peripheral hardware and input devices.', 
        'qty': 62, 
        'reorder': 20, 
    },
    {
        'code': 'CON-WEB-12', 
        'name': 'Logitech C920 HD Pro Webcam', 
        'category': 'Peripherals', 
        'description': 'Full HD 1080p video webcam with dual stereo microphones and autofocus.', 
        'qty': 0, 
        'reorder': 5, 
    },
    {
        'code': 'CON-MEM-03', 
        'name': 'SanDisk 64GB USB 3.0 Flash Drive', 
        'category': 'Storage', 
        'description': 'High-speed USB 3.0 flash drive for secure offline data transfer and backups.', 
        'qty': 112, 
        'reorder': 30, 
    },
    {
        'code': 'CON-POW-07', 
        'name': 'USB-C Fast Charger Brick (65W)', 
        'category': 'Power', 
        'description': 'Compact GaN fast charging power adapter with Power Delivery support.', 
        'qty': 14, 
        'reorder': 10, 
    },
]

class StockCategoryViewSet(viewsets.ModelViewSet):
    queryset = StockCategory.objects.all().order_by('name')
    serializer_class = StockCategorySerializer
    permission_classes = [IsAdminUserOrReadOnly]

class StockProductViewSet(viewsets.ModelViewSet):
    queryset = StockProduct.objects.all().order_by('name')
    serializer_class = StockProductSerializer
    permission_classes = [IsAdminUserOrReadOnly]

    def get_queryset(self):
        # Auto-seed sample categories and products if empty
        if not StockProduct.objects.exists():
            for p in PRODUCTS_DB:
                cat_obj, _ = StockCategory.objects.get_or_create(name=p['category'])
                StockProduct.objects.create(
                    code=p['code'],
                    name=p['name'],
                    category=cat_obj,
                    description=p['description'],
                    qty=p['qty'],
                    reorder=p['reorder']
                )
        return super().get_queryset()
class StockTransactionViewSet(viewsets.ModelViewSet):
    queryset = StockTransaction.objects.all().select_related('product').order_by('-date')
    serializer_class = StockTransactionSerializer
    permission_classes = [IsAdminUserOrReadOnly]

    def perform_create(self, serializer):
        with transaction.atomic():
            instance = serializer.save()
            prod = StockProduct.objects.select_for_update().get(pk=instance.product.pk)
            if instance.type == 'IN':
                prod.qty += instance.qty
            elif instance.type == 'OUT':
                prod.qty = max(0, prod.qty - instance.qty)
            prod.save()

    def perform_destroy(self, instance):
        with transaction.atomic():
            prod = instance.product
            prod = StockProduct.objects.select_for_update().get(pk=prod.pk)
            if instance.type == 'IN':
                prod.qty = max(0, prod.qty - instance.qty)
            elif instance.type == 'OUT':
                prod.qty += instance.qty
            prod.save()
            instance.delete()

    def perform_update(self, serializer):
        with transaction.atomic():
            old_instance = self.get_object()
            old_qty = old_instance.qty
            old_type = old_instance.type
            old_product = old_instance.product

            # Save the new state using serializer
            new_instance = serializer.save()
            new_qty = new_instance.qty
            new_type = new_instance.type
            new_product = new_instance.product

            # Revert old product quantity
            old_prod_locked = StockProduct.objects.select_for_update().get(pk=old_product.pk)
            if old_type == 'IN':
                old_prod_locked.qty = max(0, old_prod_locked.qty - old_qty)
            elif old_type == 'OUT':
                old_prod_locked.qty += old_qty
            old_prod_locked.save()

            # Apply new product quantity
            new_prod_locked = StockProduct.objects.select_for_update().get(pk=new_product.pk)
            if new_type == 'IN':
                new_prod_locked.qty += new_qty
            elif new_type == 'OUT':
                new_prod_locked.qty = max(0, new_prod_locked.qty - new_qty)
            new_prod_locked.save()

    def get_queryset(self):
        # Auto-seed sample transactions if empty
        if not StockTransaction.objects.exists():
            # First ensure products are seeded
            if not StockProduct.objects.exists():
                for p in PRODUCTS_DB:
                    cat_obj, _ = StockCategory.objects.get_or_create(name=p['category'])
                    StockProduct.objects.create(
                        code=p['code'],
                        name=p['name'],
                        category=cat_obj,
                        description=p['description'],
                        qty=p['qty'],
                        reorder=p['reorder']
                    )
            # Create sample transactions
            sample_txs = [
                {'date': '2026-07-08', 'code': 'CON-USB-01', 'type': 'IN', 'details': 'Metro Procurement', 'qty': 20, 'unit': 'Boxes'},
                {'date': '2026-07-08', 'code': 'CON-USB-01', 'type': 'OUT', 'details': 'John Doe (Engineering)', 'qty': 2, 'unit': 'Pieces'},
                {'date': '2026-07-08', 'code': 'CON-CAB-05', 'type': 'OUT', 'details': 'Sarah Smith (Marketing)', 'qty': 1, 'unit': 'Pieces'},
                {'date': '2026-07-07', 'code': 'CON-POW-07', 'type': 'IN', 'details': 'Anker Solutions', 'qty': 15, 'unit': 'Boxes'},
                {'date': '2026-07-07', 'code': 'CON-POW-07', 'type': 'OUT', 'details': 'Robert Lee (Operations)', 'qty': 1, 'unit': 'Pieces'},
                {'date': '2026-07-05', 'code': 'CON-BAT-09', 'type': 'IN', 'details': 'Metro Distributors', 'qty': 50, 'unit': 'Packs'},
            ]
            for tx in sample_txs:
                prod = StockProduct.objects.filter(code=tx['code']).first()
                if prod:
                    StockTransaction.objects.create(
                        date=tx['date'],
                        product=prod,
                        type=tx['type'],
                        details=tx['details'],
                        qty=tx['qty'],
                        unit=tx['unit']
                    )
        return super().get_queryset()

    @action(detail=False, methods=['POST'])
    def bulk_in(self, request):
        date_str = request.data.get('date')
        supplier = (request.data.get('supplier') or '').strip()
        transactions_data = request.data.get('transactions', [])

        if not date_str or not transactions_data:
            return Response({"error": "Missing date or transaction data"}, status=400)

        details_str = supplier or 'Bulk Inbound Registry'

        with transaction.atomic():
            for item in transactions_data:
                code = item.get('product_code')
                qty = int(item.get('qty', 0))
                unit = item.get('unit', 'pieces')
                desc = item.get('description', '')

                prod = StockProduct.objects.select_for_update().filter(code=code).first()
                if prod:
                    # Update description in product catalog if user customized it
                    if desc and prod.description != desc:
                        prod.description = desc
                    prod.qty += qty
                    prod.save()

                    StockTransaction.objects.create(
                        date=date_str,
                        product=prod,
                        type='IN',
                        details=details_str,
                        qty=qty,
                        unit=unit
                    )

        return Response({"status": "Bulk inbound transactions registered successfully"}, status=201)

    @action(detail=False, methods=['POST'])
    def bulk_out(self, request):
        date_str = request.data.get('date')
        demand_by = request.data.get('demand_by')
        transactions_data = request.data.get('transactions', [])

        if not date_str or not demand_by or not transactions_data:
            return Response({"error": "Missing date, demand_by recipient, or transaction data"}, status=400)

        with transaction.atomic():
            for item in transactions_data:
                code = item.get('product_code')
                qty = int(item.get('qty', 0))
                unit = item.get('unit', 'pieces')
                purpose = item.get('purpose', '')

                prod = StockProduct.objects.select_for_update().filter(code=code).first()
                if prod:
                    prod.qty = max(0, prod.qty - qty)
                    prod.save()

                    details_str = f"{demand_by} ({purpose})" if purpose else demand_by

                    StockTransaction.objects.create(
                        date=date_str,
                        product=prod,
                        type='OUT',
                        details=details_str,
                        qty=qty,
                        unit=unit
                    )

        return Response({"status": "Bulk outbound transactions registered successfully"}, status=201)
