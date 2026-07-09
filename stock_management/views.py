from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db import transaction
from django.utils import timezone
from .models import StockProduct, StockTransaction
from .serializers import StockProductSerializer, StockTransactionSerializer

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

class StockProductViewSet(viewsets.ModelViewSet):
    queryset = StockProduct.objects.all().order_by('name')
    serializer_class = StockProductSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Auto-seed sample products if empty
        if not StockProduct.objects.exists():
            for p in PRODUCTS_DB:
                StockProduct.objects.create(
                    code=p['code'],
                    name=p['name'],
                    category=p['category'],
                    description=p['description'],
                    qty=p['qty'],
                    reorder=p['reorder']
                )
        return super().get_queryset()

class StockTransactionViewSet(viewsets.ModelViewSet):
    queryset = StockTransaction.objects.all().select_related('product').order_by('-date')
    serializer_class = StockTransactionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        # Auto-seed sample transactions if empty
        if not StockTransaction.objects.exists():
            # First ensure products are seeded
            if not StockProduct.objects.exists():
                for p in PRODUCTS_DB:
                    StockProduct.objects.create(
                        code=p['code'],
                        name=p['name'],
                        category=p['category'],
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
        transactions_data = request.data.get('transactions', [])

        if not date_str or not transactions_data:
            return Response({"error": "Missing date or transaction data"}, status=400)

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
                        details='Bulk Inbound Registry',
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
