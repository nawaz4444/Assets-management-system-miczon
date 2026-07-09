from django.db import models

class StockProduct(models.Model):
    code = models.CharField(max_length=50, unique=True)
    name = models.CharField(max_length=255)
    category = models.CharField(max_length=100)
    description = models.TextField(blank=True, default='')
    qty = models.IntegerField(default=0)
    reorder = models.IntegerField(default=10)

    def __str__(self):
        return f"{self.name} ({self.code})"

class StockTransaction(models.Model):
    TRANSACTION_TYPES = [
        ('IN', 'Stock IN'),
        ('OUT', 'Stock OUT'),
    ]
    date = models.DateField(db_index=True)
    product = models.ForeignKey(StockProduct, on_delete=models.CASCADE, related_name='transactions')
    type = models.CharField(max_length=10, choices=TRANSACTION_TYPES)
    details = models.CharField(max_length=255, blank=True, default='')  # Supplier name / Employee name
    qty = models.IntegerField()
    unit = models.CharField(max_length=50, default='pieces')

    def __str__(self):
        return f"{self.type} - {self.qty} {self.unit} of {self.product.code} on {self.date}"
