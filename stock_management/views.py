from collections import defaultdict
from django.db import transaction
from rest_framework import viewsets, permissions, serializers
from rest_framework.decorators import action
from rest_framework.response import Response
from .models import StockCategory, StockProduct, StockTransaction
from .serializers import StockCategorySerializer, StockProductSerializer, StockTransactionSerializer


def apply_stock_changes(changes):
    products = {p.pk: p for p in StockProduct.objects.select_for_update().filter(pk__in=changes).order_by('pk')}
    if len(products) != len(changes):
        raise serializers.ValidationError({'product': 'A selected product no longer exists.'})
    for pk, delta in changes.items():
        product = products[pk]
        if product.qty + delta < 0:
            raise serializers.ValidationError({'qty': f'Insufficient stock for {product.code}: {product.qty} available.'})
        product.qty += delta
        product.save(update_fields=['qty'])


def signed_qty(kind, qty):
    return qty if kind == 'IN' else -qty


class StockCategoryViewSet(viewsets.ModelViewSet):
    queryset = StockCategory.objects.all().order_by('name')
    serializer_class = StockCategorySerializer
    permission_classes = [permissions.IsAuthenticated]


class StockProductViewSet(viewsets.ModelViewSet):
    queryset = StockProduct.objects.all().order_by('name')
    serializer_class = StockProductSerializer
    permission_classes = [permissions.IsAuthenticated]


class StockTransactionViewSet(viewsets.ModelViewSet):
    queryset = StockTransaction.objects.all().select_related('product').order_by('-date', '-pk')
    serializer_class = StockTransactionSerializer
    permission_classes = [permissions.IsAuthenticated]

    def perform_create(self, serializer):
        with transaction.atomic():
            data = serializer.validated_data
            apply_stock_changes({data['product'].pk: signed_qty(data['type'], data['qty'])})
            serializer.save()

    def perform_update(self, serializer):
        with transaction.atomic():
            old = StockTransaction.objects.select_for_update().get(pk=serializer.instance.pk)
            data = serializer.validated_data
            changes = defaultdict(int)
            changes[old.product_id] -= signed_qty(old.type, old.qty)
            changes[data.get('product', old.product).pk] += signed_qty(data.get('type', old.type), data.get('qty', old.qty))
            apply_stock_changes(changes)
            serializer.instance = old
            serializer.save()

    def perform_destroy(self, instance):
        with transaction.atomic():
            instance = StockTransaction.objects.select_for_update().get(pk=instance.pk)
            apply_stock_changes({instance.product_id: -signed_qty(instance.type, instance.qty)})
            instance.delete()

    def _bulk(self, request, kind):
        class Item(serializers.Serializer):
            product_code = serializers.CharField()
            qty = serializers.IntegerField(min_value=1)
            unit = serializers.CharField(default='pieces', max_length=50)
            description = serializers.CharField(required=False, allow_blank=True)
            purpose = serializers.CharField(required=False, allow_blank=True)

        class Batch(serializers.Serializer):
            date = serializers.DateField()
            supplier = serializers.CharField(required=False, allow_blank=True, max_length=255)
            demand_by = serializers.CharField(required=kind == 'OUT', allow_blank=False, max_length=255)
            transactions = Item(many=True, allow_empty=False)

        batch = Batch(data=request.data)
        batch.is_valid(raise_exception=True)
        data = batch.validated_data
        with transaction.atomic():
            products = {p.code: p for p in StockProduct.objects.select_for_update().filter(
                code__in=[row['product_code'] for row in data['transactions']]).order_by('pk')}
            missing = sorted({row['product_code'] for row in data['transactions']} - products.keys())
            if missing:
                raise serializers.ValidationError({'transactions': f'Unknown product codes: {", ".join(missing)}'})
            changes = defaultdict(int)
            prepared = []
            for row in data['transactions']:
                product = products[row['product_code']]
                details = (data.get('supplier') or 'Bulk Inbound Registry') if kind == 'IN' else data['demand_by']
                if kind == 'OUT' and row.get('purpose'):
                    details += f" ({row['purpose']})"
                item = StockTransactionSerializer(data={
                    'date': data['date'], 'product': product.pk, 'type': kind,
                    'qty': row['qty'], 'unit': row['unit'], 'details': details})
                item.is_valid(raise_exception=True)
                changes[product.pk] += signed_qty(kind, row['qty'])
                prepared.append(item)
            apply_stock_changes(changes)
            for item in prepared:
                item.save()
            if kind == 'IN':
                for row in data['transactions']:
                    if row.get('description'):
                        product = products[row['product_code']]
                        product.description = row['description']
                        product.save(update_fields=['description'])
        return Response({'status': 'Bulk transactions registered successfully'}, status=201)

    @action(detail=False, methods=['post'])
    def bulk_in(self, request):
        return self._bulk(request, 'IN')

    @action(detail=False, methods=['post'])
    def bulk_out(self, request):
        return self._bulk(request, 'OUT')

    @action(detail=False, methods=['post'], url_path='batch-change')
    def batch_change(self, request):
        class BatchChange(serializers.Serializer):
            ids = serializers.ListField(child=serializers.IntegerField(min_value=1), allow_empty=False)
            delete = serializers.BooleanField(default=False)
            transactions = serializers.ListField(child=serializers.DictField(), required=False)

        payload = BatchChange(data=request.data)
        payload.is_valid(raise_exception=True)
        data = payload.validated_data
        with transaction.atomic():
            rows = list(StockTransaction.objects.select_for_update().filter(pk__in=data['ids']).order_by('pk'))
            if len(rows) != len(set(data['ids'])):
                raise serializers.ValidationError({'ids': 'A transaction no longer exists.'})
            changes = defaultdict(int)
            prepared = []
            replacements = {row.get('id'): row for row in data.get('transactions', [])}
            if not data['delete'] and set(replacements) != {row.pk for row in rows}:
                raise serializers.ValidationError({'transactions': 'Provide one update for every selected transaction.'})
            for row in rows:
                changes[row.product_id] -= signed_qty(row.type, row.qty)
                if not data['delete']:
                    serializer = self.get_serializer(row, data=replacements[row.pk])
                    serializer.is_valid(raise_exception=True)
                    new = serializer.validated_data
                    changes[new['product'].pk] += signed_qty(new['type'], new['qty'])
                    prepared.append(serializer)
            apply_stock_changes(changes)
            if data['delete']:
                StockTransaction.objects.filter(pk__in=data['ids']).delete()
            else:
                for serializer in prepared:
                    serializer.save()
        return Response({'status': 'Batch updated'})
