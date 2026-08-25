from django.db import migrations

def seed_super_categories(apps, schema_editor):
    SuperCategory = apps.get_model('inventory', 'SuperCategory')
    Asset = apps.get_model('inventory', 'Asset')
    HealthCheckSession = apps.get_model('inventory', 'HealthCheckSession')

    it_assets, _ = SuperCategory.objects.get_or_create(
        code='it_assets',
        defaults={
            'name': 'IT Assets',
            'description': 'Laptops, desktops, phones, servers, peripherals & IT hardware'
        }
    )
    furniture, _ = SuperCategory.objects.get_or_create(
        code='furniture',
        defaults={
            'name': 'Furniture',
            'description': 'Desks, chairs, tables, cabinets & office furniture'
        }
    )
    appliances, _ = SuperCategory.objects.get_or_create(
        code='appliances',
        defaults={
            'name': 'Appliances',
            'description': 'Air conditioners, refrigerators, microwaves, heaters & appliances'
        }
    )

    # Link all existing assets and health check sessions to IT Assets by default
    Asset.objects.filter(super_category__isnull=True).update(super_category=it_assets)
    HealthCheckSession.objects.filter(super_category__isnull=True).update(super_category=it_assets)

def reverse_seed(apps, schema_editor):
    pass

class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0018_supercategory_alter_asset_id_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_super_categories, reverse_code=reverse_seed),
    ]
