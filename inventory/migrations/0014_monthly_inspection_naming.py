from django.db import migrations, models


def rename_global_health_checks(apps, schema_editor):
    HealthCheckSession = apps.get_model('inventory', 'HealthCheckSession')
    replacements = [
        ('Global Hardware Health Check', 'Monthly Hardware Inspection'),
        ('Global Health Check', 'Monthly Hardware Inspection'),
    ]

    for old_text, new_text in replacements:
        for session in HealthCheckSession.objects.filter(title__startswith=old_text):
            session.title = session.title.replace(old_text, new_text, 1)
            session.save(update_fields=['title'])


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0013_generic_healthcheck_fields'),
    ]

    operations = [
        migrations.AlterField(
            model_name='healthchecksession',
            name='title',
            field=models.CharField(default='Monthly Hardware Inspection', max_length=150),
        ),
        migrations.RunPython(rename_global_health_checks, migrations.RunPython.noop),
    ]
