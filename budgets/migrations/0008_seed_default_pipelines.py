from django.db import migrations


def seed(apps, schema_editor):
    ApprovalPipeline = apps.get_model('budgets', 'ApprovalPipeline')
    ApprovalStage = apps.get_model('budgets', 'ApprovalStage')
    AdvanceRequest = apps.get_model('budgets', 'AdvanceRequest')
    ExpenseClaim = apps.get_model('budgets', 'ExpenseClaim')

    # Default budget pipeline: Finance -> CEO (reproduces the old fixed flow).
    if not ApprovalPipeline.objects.filter(kind='BUDGET', department__isnull=True).exists():
        pl = ApprovalPipeline.objects.create(kind='BUDGET', department=None, is_active=True)
        ApprovalStage.objects.create(pipeline=pl, order=1, approver_kind='ROLE', role='FINANCE')
        ApprovalStage.objects.create(pipeline=pl, order=2, approver_kind='ROLE', role='CEO')

    # Default claim pipeline: Department Manager -> Finance -> CEO.
    if not ApprovalPipeline.objects.filter(kind='CLAIM', claim_type__isnull=True).exists():
        pl = ApprovalPipeline.objects.create(kind='CLAIM', claim_type=None, is_active=True)
        ApprovalStage.objects.create(pipeline=pl, order=1, approver_kind='DEPT_MANAGER')
        ApprovalStage.objects.create(pipeline=pl, order=2, approver_kind='ROLE', role='FINANCE')
        ApprovalStage.objects.create(pipeline=pl, order=3, approver_kind='ROLE', role='CEO')

    # Move in-flight requests onto the generic PENDING + current_step pointer.
    budget_steps = {'PENDING_FINANCE': 1, 'PENDING_CEO': 2}
    for req in AdvanceRequest.objects.filter(status__in=budget_steps):
        req.current_step = budget_steps[req.status]
        req.status = 'PENDING'
        req.save(update_fields=['status', 'current_step'])

    claim_steps = {'PENDING_MANAGER': 1, 'PENDING_FINANCE': 2, 'PENDING_CEO': 3}
    for claim in ExpenseClaim.objects.filter(status__in=claim_steps):
        claim.current_step = claim_steps[claim.status]
        claim.status = 'PENDING'
        claim.save(update_fields=['status', 'current_step'])


def unseed(apps, schema_editor):
    # Non-destructive reverse: just drop the pipelines we may have created.
    ApprovalPipeline = apps.get_model('budgets', 'ApprovalPipeline')
    ApprovalPipeline.objects.filter(department__isnull=True, claim_type__isnull=True).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('budgets', '0007_approvaltask_stage_label_expenseclaim_current_step_and_more'),
    ]

    operations = [
        migrations.RunPython(seed, unseed),
    ]
