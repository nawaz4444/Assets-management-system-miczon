from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0012_asset_request_reason'),
    ]

    operations = [
        migrations.AlterField(
            model_name='healthcheckresponse',
            name='screen_condition',
            field=models.CharField(choices=[('EXCELLENT', 'Excellent'), ('GOOD', 'Good'), ('SCRATCHED', 'Scratched'), ('CRACKED', 'Cracked'), ('NEEDS_REPAIR', 'Needs Repair'), ('NOT_APPLICABLE', 'Not Applicable (N/A)')], max_length=30),
        ),
        migrations.AlterField(
            model_name='healthcheckresponse',
            name='battery_life',
            field=models.CharField(choices=[('EXCELLENT', 'Excellent'), ('GOOD', 'Good'), ('FAIR', 'Fair'), ('POOR', 'Poor'), ('NOT_APPLICABLE', 'Not Applicable (N/A)')], max_length=30),
        ),
        migrations.AddField(
            model_name='healthcheckresponse',
            name='physical_condition',
            field=models.CharField(choices=[('EXCELLENT', 'Excellent'), ('GOOD_MINOR_WEAR', 'Good (Minor wear)'), ('FAIR_SCRATCHES_DENTS', 'Fair (Noticeable scratches/dents)'), ('POOR_CRACKED_BROKEN', 'Poor (Cracked/Broken)')], default='GOOD_MINOR_WEAR', max_length=40),
        ),
        migrations.AddField(
            model_name='healthcheckresponse',
            name='power_boot_status',
            field=models.CharField(choices=[('BOOTS_NORMALLY', 'Boots normally'), ('SLOW_TO_BOOT', 'Slow to boot'), ('POWERS_NO_DISPLAY_OS', 'Powers on but no display/OS'), ('DOES_NOT_POWER_ON', 'Does not power on')], default='BOOTS_NORMALLY', max_length=40),
        ),
        migrations.AddField(
            model_name='healthcheckresponse',
            name='ports_connectors',
            field=models.CharField(choices=[('ALL_FUNCTIONAL', 'All functional'), ('LOOSE_CONNECTIONS', 'Loose connections'), ('VISIBLY_DAMAGED', 'Visibly damaged'), ('UNRESPONSIVE', 'Unresponsive')], default='ALL_FUNCTIONAL', max_length=40),
        ),
        migrations.AddField(
            model_name='healthcheckresponse',
            name='network_functionality',
            field=models.CharField(choices=[('CONNECTS_NORMALLY', 'Connects normally'), ('INTERMITTENT_CONNECTION', 'Intermittent connection'), ('FAILS_TO_CONNECT', 'Fails to connect')], default='CONNECTS_NORMALLY', max_length=40),
        ),
        migrations.AddField(
            model_name='healthcheckresponse',
            name='asset_tag_status',
            field=models.CharField(choices=[('INTACT_SCANNABLE', 'Intact & Scannable'), ('FADED_PEELING', 'Faded/Peeling'), ('MISSING', 'Missing')], default='INTACT_SCANNABLE', max_length=40),
        ),
    ]
