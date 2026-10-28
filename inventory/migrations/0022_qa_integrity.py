from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('inventory', '0021_asset_purchase_date_asset_purchase_price')]
    operations = [
        migrations.AddField(model_name='healthchecksession', name='targets_snapshot', field=models.JSONField(blank=True, editable=False, null=True)),
        migrations.AddField(model_name='assetactionrequest', name='submitted_by', field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='submitted_asset_requests', to='auth.user')),
        migrations.AddConstraint(model_name='assetassignment', constraint=models.UniqueConstraint(condition=models.Q(status='ASSIGNED'), fields=('asset',), name='one_active_assignment_per_asset')),
    ]
