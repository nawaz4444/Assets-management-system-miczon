from django.db import migrations


# Rename existing super categories (keyed by stable code) and add Motor Vehicle.
RENAMES = {
    'it_assets': {
        'name': 'Computer and IT',
        'description': 'Laptops, desktops, phones, servers, peripherals & IT hardware',
    },
    'furniture': {
        'name': 'Furniture and Fixture',
        'description': 'Desks, chairs, tables, cabinets & office furniture',
    },
    'appliances': {
        'name': 'Office Equipment',
        'description': 'Air conditioners, refrigerators, microwaves, heaters & office equipment',
    },
}

OLD_NAMES = {
    'it_assets': 'IT Assets',
    'furniture': 'Furniture',
    'appliances': 'Appliances',
}


def rename_and_add(apps, schema_editor):
    SuperCategory = apps.get_model('inventory', 'SuperCategory')

    for code, data in RENAMES.items():
        SuperCategory.objects.filter(code=code).update(
            name=data['name'],
            description=data['description'],
        )

    SuperCategory.objects.get_or_create(
        code='motor_vehicle',
        defaults={
            'name': 'Motor Vehicle',
            'description': 'Cars, bikes, trucks & other company vehicles',
        },
    )


def reverse(apps, schema_editor):
    SuperCategory = apps.get_model('inventory', 'SuperCategory')
    for code, old_name in OLD_NAMES.items():
        SuperCategory.objects.filter(code=code).update(name=old_name)
    SuperCategory.objects.filter(code='motor_vehicle').delete()


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0020_healthcheckresponse_compressor_motor_status_and_more'),
    ]

    operations = [
        migrations.RunPython(rename_and_add, reverse_code=reverse),
    ]
