from rest_framework import serializers
from .models import StockProduct, StockTransaction

class StockProductSerializer(serializers.ModelSerializer):
    status = serializers.SerializerMethodField()

    class Meta:
        model = StockProduct
        fields = ['id', 'code', 'name', 'category', 'description', 'qty', 'reorder', 'status']

    def get_status(self, obj):
        if obj.qty <= 0:
            return 'Out of Stock'
        elif obj.qty <= obj.reorder:
            return 'Low Stock'
        return 'In Stock'

class StockTransactionSerializer(serializers.ModelSerializer):
    product_code = serializers.CharField(source='product.code', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_category = serializers.CharField(source='product.category', read_only=True)

    class Meta:
        model = StockTransaction
        fields = ['id', 'date', 'product', 'product_code', 'product_name', 'product_category', 'type', 'details', 'qty', 'unit']
