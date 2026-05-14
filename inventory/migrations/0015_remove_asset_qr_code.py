from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0014_monthly_inspection_naming'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='asset',
            name='qr_code',
        ),
    ]
