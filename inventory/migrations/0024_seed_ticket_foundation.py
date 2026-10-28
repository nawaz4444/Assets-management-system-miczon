from django.db import migrations


# Agent groups that resolve tickets.
AGENT_GROUPS = [
    ('IT Support', 'Hardware, software, network and asset requests'),
    ('Admin & Facilities', 'Office facilities, supplies, maintenance and front desk'),
    ('HR', 'Employee benefits, leave and HR matters'),
    ('Finance', 'Payroll, salary and reimbursement matters'),
    ('Operations', 'General and uncategorized requests'),
]

# Category name -> (description, default agent group, [types])
CATEGORIES = {
    'IT And Technical Support': (
        'Hardware, software, network and IT asset support', 'IT Support',
        ['Assets Request', 'Internet Connectivity', 'Hardware Issue', 'Software Support', 'Network Access'],
    ),
    'Office Facilities And Supplies': (
        'Office facilities, supplies and maintenance', 'Admin & Facilities',
        ['Supply', 'Office Policies', 'Maintenance'],
    ),
    'Payroll And Financial Matters': (
        'Salary, payroll and reimbursement queries', 'Finance',
        ['Other Salary Matters', 'Reimbursement'],
    ),
    'HR And Employee Benefits': (
        'HR, benefits and leave entitlement', 'HR',
        ['Leave Policy And Entitlement', 'Benefits Query'],
    ),
    'Compliance And Workplace Safety': (
        'Health, safety and workplace compliance', 'Admin & Facilities',
        ['Health And Safety Concerns', 'Reporting Workplace Incidents'],
    ),
    'Front Desk': (
        'Reception, visitors and meeting arrangements', 'Admin & Facilities',
        ['CEO Meeting Arrangements', 'Visitor / Front Desk'],
    ),
    'Others': (
        'General or uncategorized requests', 'Operations',
        ['Special Complain', 'General Query'],
    ),
}


def seed(apps, schema_editor):
    AgentGroup = apps.get_model('inventory', 'AgentGroup')
    TicketCategory = apps.get_model('inventory', 'TicketCategory')
    TicketType = apps.get_model('inventory', 'TicketType')

    groups = {}
    for name, desc in AGENT_GROUPS:
        groups[name], _ = AgentGroup.objects.get_or_create(name=name, defaults={'description': desc})

    for cat_name, (desc, group_name, types) in CATEGORIES.items():
        category, _ = TicketCategory.objects.get_or_create(
            name=cat_name,
            defaults={'description': desc, 'default_agent_group': groups.get(group_name)},
        )
        # Keep routing current even if the category already existed without one.
        if category.default_agent_group_id is None and groups.get(group_name):
            category.default_agent_group = groups[group_name]
            category.save(update_fields=['default_agent_group'])

        for type_name in types:
            TicketType.objects.get_or_create(name=type_name, category=category)


def unseed(apps, schema_editor):
    # Leave seeded rows in place on reverse; they may have been edited/used.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0023_agentgroup_ticketcategory_tickettype'),
    ]

    operations = [
        migrations.RunPython(seed, reverse_code=unseed),
    ]
