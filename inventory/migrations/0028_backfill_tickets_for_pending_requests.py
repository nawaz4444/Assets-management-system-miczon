from django.db import migrations


def backfill(apps, schema_editor):
    """Give every still-pending asset request a Help Desk ticket so nothing is
    orphaned once the standalone Requests page folds into the Help Desk."""
    AssetActionRequest = apps.get_model('inventory', 'AssetActionRequest')
    Ticket = apps.get_model('inventory', 'Ticket')
    TicketCategory = apps.get_model('inventory', 'TicketCategory')
    TicketType = apps.get_model('inventory', 'TicketType')

    it = TicketCategory.objects.filter(name='IT And Technical Support').first()
    if not it:
        return

    type_by_action = {
        t.asset_action: t
        for t in TicketType.objects.filter(category=it).exclude(asset_action='')
    }

    pending = AssetActionRequest.objects.filter(status='PENDING', ticket__isnull=True).select_related('requester', 'asset')
    for req in pending:
        if not req.requester_id:
            continue
        ticket_type = type_by_action.get(req.action_type)
        if not ticket_type:
            continue
        group = ticket_type.agent_group or it.default_agent_group
        label = req.requested_device_type or (req.asset.name if req.asset else 'Asset request')
        ticket = Ticket.objects.create(
            title=f"{ticket_type.name}: {label}"[:200],
            category=it,
            ticket_type=ticket_type,
            priority='MEDIUM',
            description=req.reason_for_request or req.remarks or '',
            raised_by=req.requester,
            action_request=req,
            assigned_group=group,
            status='NEW',
        )
        ticket.code = f"TKT-{ticket.pk:05d}"
        ticket.save(update_fields=['code'])


def noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('inventory', '0027_seed_asset_ticket_types'),
    ]

    operations = [
        migrations.RunPython(backfill, reverse_code=noop),
    ]
