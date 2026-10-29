from django.db import migrations


# Collapse the five asset-action ticket types into a single plain "Asset" type
# under "IT And Technical Support". The new type has NO asset_action, so raising
# it does not spawn an AssetActionRequest — the agent handles the transfer /
# return / repair manually in the Inventory module (manual handling).
IT_CATEGORY = 'IT And Technical Support'
ASSET_TYPE = 'Asset'
OLD_ASSET_TYPES = ['Asset - New', 'Asset - Assignment', 'Asset - Transfer', 'Asset - Return', 'Asset - Repair']


def consolidate(apps, schema_editor):
    TicketCategory = apps.get_model('inventory', 'TicketCategory')
    TicketType = apps.get_model('inventory', 'TicketType')
    category = TicketCategory.objects.filter(name=IT_CATEGORY).first()
    if not category:
        return

    # One plain "Asset" type — no asset_action (manual handling).
    obj, _ = TicketType.objects.get_or_create(name=ASSET_TYPE, category=category)
    changed = False
    if obj.asset_action:
        obj.asset_action = ''
        changed = True
    if not obj.is_active:
        obj.is_active = True
        changed = True
    if changed:
        obj.save(update_fields=['asset_action', 'is_active'])

    # Hide the old granular asset types (kept for FK integrity with any tickets).
    TicketType.objects.filter(category=category, name__in=OLD_ASSET_TYPES).update(is_active=False)


def restore(apps, schema_editor):
    TicketCategory = apps.get_model('inventory', 'TicketCategory')
    TicketType = apps.get_model('inventory', 'TicketType')
    category = TicketCategory.objects.filter(name=IT_CATEGORY).first()
    if not category:
        return
    TicketType.objects.filter(category=category, name__in=OLD_ASSET_TYPES).update(is_active=True)
    obj = TicketType.objects.filter(category=category, name=ASSET_TYPE).first()
    if obj and not obj.tickets.exists():
        obj.delete()


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0029_merge_20261028_1444'),
    ]

    operations = [
        migrations.RunPython(consolidate, reverse_code=restore),
    ]
