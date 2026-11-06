"""Standardize status display labels: uniform short states (Pending, Approved,
Rejected, Cancelled, Draft) on budget tickets and expense tickets. DB-level
no-op (only the human-readable choices change)."""
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('budgets', '0009_dynamic_roles_named_pipelines'),
    ]

    operations = [
        migrations.AlterField(
            model_name='advancerequest',
            name='status',
            field=models.CharField(
                max_length=20, default='DRAFT',
                choices=[
                    ('DRAFT', 'Draft'),
                    ('PENDING', 'Pending'),
                    ('PENDING_FINANCE', 'Pending'),
                    ('PENDING_CEO', 'Pending'),
                    ('APPROVED', 'Approved'),
                    ('REJECTED', 'Rejected'),
                    ('CANCELLED', 'Cancelled'),
                ],
            ),
        ),
        migrations.AlterField(
            model_name='expenseclaim',
            name='status',
            field=models.CharField(
                max_length=20, default='PENDING',
                choices=[
                    ('PENDING', 'Pending'),
                    ('PENDING_MANAGER', 'Pending'),
                    ('PENDING_FINANCE', 'Pending'),
                    ('PENDING_CEO', 'Pending'),
                    ('APPROVED', 'Approved'),
                    ('REJECTED', 'Rejected'),
                    ('CANCELLED', 'Cancelled'),
                ],
            ),
        ),
    ]
