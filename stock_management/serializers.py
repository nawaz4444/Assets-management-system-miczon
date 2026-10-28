from rest_framework import serializers
from .models import StockCategory, StockProduct, StockTransaction

class StockCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = StockCategory
        fields = ['id', 'name']

class StockProductSerializer(serializers.ModelSerializer):
    qty = serializers.IntegerField(read_only=True)
    reorder = serializers.IntegerField(min_value=0, default=10)
    category_name = serializers.CharField(source='category.name', read_only=True)
    status = serializers.SerializerMethodField()

    class Meta:
        model = StockProduct
        fields = ['id', 'code', 'name', 'category', 'category_name', 'description', 'qty', 'reorder', 'status']

    def get_status(self, obj):
        if obj.qty <= 0:
            return 'Out of Stock'
        elif obj.qty <= obj.reorder:
            return 'Low Stock'
        return 'In Stock'

class StockTransactionSerializer(serializers.ModelSerializer):
    qty = serializers.IntegerField(min_value=1)
    product_code = serializers.CharField(source='product.code', read_only=True)
    product_name = serializers.CharField(source='product.name', read_only=True)
    product_category = serializers.CharField(source='product.category.name', read_only=True)

    class Meta:
        model = StockTransaction
        fields = ['id', 'date', 'product', 'product_code', 'product_name', 'product_category', 'type', 'details', 'qty', 'unit']
