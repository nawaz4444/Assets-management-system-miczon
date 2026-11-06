from django.db import migrations


def backfill(apps, schema_editor):
    """Link pre-existing cycles and requests (created when budgets were
    department-level) to the department's budget line, so balances carry over
    into the new per-category model instead of resetting."""
    BudgetCycle = apps.get_model('budgets', 'BudgetCycle')
    DepartmentBudget = apps.get_model('budgets', 'DepartmentBudget')
    AdvanceRequest = apps.get_model('budgets', 'AdvanceRequest')

    for cycle in BudgetCycle.objects.filter(budget__isnull=True):
        line = (DepartmentBudget.objects.filter(department_id=cycle.department_id, name='General').first()
                or DepartmentBudget.objects.filter(department_id=cycle.department_id).order_by('id').first())
        if not line:
            continue
        # Skip if a per-category cycle already exists for this period (avoids
        # colliding on the (budget, month, year) uniqueness); leave the stale
        # department-level cycle unlinked and ignored by the app.
        if BudgetCycle.objects.filter(budget_id=line.id, month=cycle.month, year=cycle.year).exists():
            continue
        cycle.budget_id = line.id
        cycle.save(update_fields=['budget'])

    for req in AdvanceRequest.objects.filter(budget__isnull=True, cycle__isnull=False):
        if req.cycle.budget_id:
            req.budget_id = req.cycle.budget_id
            req.save(update_fields=['budget'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('budgets', '0003_alter_departmentbudget_options_and_more'),
    ]

    operations = [
        migrations.RunPython(backfill, noop),
    ]
