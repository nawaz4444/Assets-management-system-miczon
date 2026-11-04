"""Make approval roles user-defined and pipelines named & reusable.

Before: roles were the fixed choices FINANCE/CEO; pipelines were scoped per
department (budgets) or per claim type (claims), with a null = Default row.

After: roles are rows in ApprovalRole (Finance/CEO become editable seeds); a
pipeline is a named, reusable chain attached to any number of budget categories
(DepartmentBudget.pipeline) and claim types (ClaimType.pipeline).

The data step runs between the additive and destructive schema changes, so the
historical models still carry both the old columns (kind/department/claim_type,
the role char fields) and the new ones (name, the role FKs, the attachments).
Existing in-flight requests keep routing correctly because every budget
category and claim type is attached to the very pipeline it resolved through
before.
"""
from django.db import migrations, models
import django.db.models.deletion


LABELS = {'FINANCE': 'Finance', 'CEO': 'CEO', 'CLAIMANT': 'Can submit claims'}


def forwards(apps, schema_editor):
    ApprovalRole = apps.get_model('budgets', 'ApprovalRole')
    ApprovalPipeline = apps.get_model('budgets', 'ApprovalPipeline')
    ApprovalStage = apps.get_model('budgets', 'ApprovalStage')
    BudgetRoleAssignment = apps.get_model('budgets', 'BudgetRoleAssignment')
    DepartmentBudget = apps.get_model('budgets', 'DepartmentBudget')
    ClaimType = apps.get_model('budgets', 'ClaimType')

    # 1. One ApprovalRole per role code used by any stage or assignment.
    codes = set(ApprovalStage.objects.exclude(role='').values_list('role', flat=True))
    codes |= set(BudgetRoleAssignment.objects.values_list('role', flat=True))
    role_by_code = {}
    for code in codes:
        if not code:
            continue
        name = LABELS.get(code, code.replace('_', ' ').title())
        role_by_code[code] = ApprovalRole.objects.get_or_create(name=name)[0]

    # 2. Point stages and assignments at the new role objects.
    for st in ApprovalStage.objects.exclude(role=''):
        r = role_by_code.get(st.role)
        if r:
            st.role_new = r
            st.save(update_fields=['role_new'])
    for a in BudgetRoleAssignment.objects.all():
        r = role_by_code.get(a.role)
        if r:
            a.role_new = r
            a.save(update_fields=['role_new'])

    # 3. Name every existing pipeline; remember the old scopes for attachment.
    used = set()

    def unique_name(base):
        name = base
        n = 2
        while name in used:
            name = f"{base} {n}"
            n += 1
        used.add(name)
        return name

    default_budget = default_claim = None
    budget_by_dept, claim_by_type = {}, {}
    for p in ApprovalPipeline.objects.all():
        if p.kind == 'BUDGET':
            if p.department_id:
                base = f"{p.department.name} budget"
                budget_by_dept[p.department_id] = p
            else:
                base, default_budget = 'Budget approval', p
        else:
            if p.claim_type_id:
                base = f"{p.claim_type.name} claim"
                claim_by_type[p.claim_type_id] = p
            else:
                base, default_claim = 'Claim approval', p
        p.name = unique_name(base)
        p.save(update_fields=['name'])

    # 4. Attach a pipeline to every budget category and claim type. A
    #    department/claim-type-specific pipeline is only used if it actually has
    #    steps (old per-scope rows were sometimes created empty); otherwise fall
    #    back to the default so the attachment stays submittable.
    def with_steps(p):
        return p if (p and p.stages.exists()) else None

    for b in DepartmentBudget.objects.all():
        p = with_steps(budget_by_dept.get(b.department_id)) or default_budget
        if p:
            b.pipeline = p
            b.save(update_fields=['pipeline'])
    for ct in ClaimType.objects.all():
        p = with_steps(claim_by_type.get(ct.id)) or default_claim
        if p:
            ct.pipeline = p
            ct.save(update_fields=['pipeline'])


class Migration(migrations.Migration):

    dependencies = [
        ('budgets', '0008_seed_default_pipelines'),
    ]

    operations = [
        # --- new model -----------------------------------------------------
        migrations.CreateModel(
            name='ApprovalRole',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=80, unique=True)),
                ('is_active', models.BooleanField(default=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'ordering': ['name']},
        ),
        # --- additive columns ---------------------------------------------
        migrations.AddField(
            model_name='approvalpipeline',
            name='name',
            field=models.CharField(default='', max_length=120),
            preserve_default=False,
        ),
        migrations.AddField(
            model_name='approvalstage',
            name='role_new',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='stages', to='budgets.approvalrole'),
        ),
        migrations.AddField(
            model_name='budgetroleassignment',
            name='role_new',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='assignments', to='budgets.approvalrole'),
        ),
        migrations.AlterUniqueTogether(
            name='budgetroleassignment',
            unique_together=set(),
        ),
        migrations.AddField(
            model_name='departmentbudget',
            name='pipeline',
            field=models.ForeignKey(blank=True, help_text='The approval chain a budget request for this category walks through.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='budget_categories', to='budgets.approvalpipeline'),
        ),
        migrations.AddField(
            model_name='claimtype',
            name='pipeline',
            field=models.ForeignKey(blank=True, help_text='The approval chain a claim of this type walks through.', null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='claim_types', to='budgets.approvalpipeline'),
        ),
        # --- migrate the data ---------------------------------------------
        migrations.RunPython(forwards, migrations.RunPython.noop),
        # --- retire the old columns ---------------------------------------
        migrations.RemoveField(model_name='approvalstage', name='role'),
        migrations.RenameField(model_name='approvalstage', old_name='role_new', new_name='role'),
        migrations.RemoveField(model_name='budgetroleassignment', name='role'),
        migrations.RenameField(model_name='budgetroleassignment', old_name='role_new', new_name='role'),
        migrations.AlterField(
            model_name='budgetroleassignment',
            name='role',
            field=models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='assignments', to='budgets.approvalrole'),
        ),
        migrations.AlterUniqueTogether(
            name='budgetroleassignment',
            unique_together={('role', 'employee')},
        ),
        migrations.RemoveField(model_name='approvalpipeline', name='kind'),
        migrations.RemoveField(model_name='approvalpipeline', name='department'),
        migrations.RemoveField(model_name='approvalpipeline', name='claim_type'),
        # --- finalise field options to match the models ------------------
        migrations.AlterField(
            model_name='approvalpipeline',
            name='name',
            field=models.CharField(max_length=120, unique=True),
        ),
        migrations.AlterModelOptions(
            name='approvalpipeline',
            options={'ordering': ['name']},
        ),
        migrations.AlterModelOptions(
            name='budgetroleassignment',
            options={'ordering': ['role__name']},
        ),
    ]
