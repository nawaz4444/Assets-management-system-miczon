import uuid

from django.db import migrations, models


def backfill_tokens(apps, schema_editor):
    StockProduct = apps.get_model('stock_management', 'StockProduct')
    for product in StockProduct.objects.filter(qr_token__isnull=True):
        product.qr_token = uuid.uuid4()
        product.save(update_fields=['qr_token'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('stock_management', '0004_alter_stockcategory_id_alter_stockproduct_id_and_more'),
    ]

    operations = [
        # 1. Add nullable so existing rows don't collide on a single default value.
        migrations.AddField(
            model_name='stockproduct',
            name='qr_token',
            field=models.UUIDField(editable=False, null=True),
        ),
        # 2. Give every existing product its own token.
        migrations.RunPython(backfill_tokens, noop),
        # 3. Lock it to the final shape: unique, indexed, auto-generated.
        migrations.AlterField(
            model_name='stockproduct',
            name='qr_token',
            field=models.UUIDField(default=uuid.uuid4, editable=False, unique=True, db_index=True),
        ),
    ]
