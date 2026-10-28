from django.db import migrations


# Asset-request ticket types under "IT And Technical Support", each wired to the
# AssetActionRequest engine via asset_action. The generic "Assets Request" type
# becomes "Asset - Assignment".
IT_CATEGORY = 'IT And Technical Support'
ASSET_TYPES = [
    ('Asset - New', 'ADD'),
    ('Asset - Assignment', 'ASSIGN'),
    ('Asset - Transfer', 'TRANSFER'),
    ('Asset - Return', 'RETURN'),
    ('Asset - Repair', 'REPAIR'),
]


def seed(apps, schema_editor):
    TicketCategory = apps.get_model('inventory', 'TicketCategory')
    TicketType = apps.get_model('inventory', 'TicketType')

    category = TicketCategory.objects.filter(name=IT_CATEGORY).first()
    if not category:
        return

    # Repurpose the old generic type if present, so any existing links survive.
    generic = TicketType.objects.filter(category=category, name='Assets Request').first()
    if generic:
        generic.name = 'Asset - Assignment'
        generic.asset_action = 'ASSIGN'
        generic.save(update_fields=['name', 'asset_action'])

    for name, action in ASSET_TYPES:
        obj, _ = TicketType.objects.get_or_create(name=name, category=category)
        if obj.asset_action != action:
            obj.asset_action = action
            obj.save(update_fields=['asset_action'])


def unseed(apps, schema_editor):
    # Leave rows in place; they may be referenced by tickets/requests.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0026_ticket_action_request_tickettype_asset_action'),
    ]

    operations = [
        migrations.RunPython(seed, reverse_code=unseed),
    ]
