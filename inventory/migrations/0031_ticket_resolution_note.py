from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0030_consolidate_asset_ticket_types'),
    ]

    operations = [
        migrations.AddField(
            model_name='ticket',
            name='resolution_note',
            field=models.TextField(blank=True, default=''),
        ),
    ]
