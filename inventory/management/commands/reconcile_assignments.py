"""Preview or explicitly reconcile current custody without inventing past events."""
from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Exists, OuterRef
from django.utils import timezone
from inventory.models import Asset, AssetAssignment


class Command(BaseCommand):
    help = 'Preview missing current assignments. --apply creates clearly labelled reconciliation records.'

    def add_arguments(self, parser):
        parser.add_argument('--apply', action='store_true', help='Write the previewed reconciliation records.')

    @transaction.atomic
    def handle(self, *args, **options):
        active = AssetAssignment.objects.filter(asset_id=OuterRef('pk'), status='ASSIGNED')
        assets = Asset.objects.select_for_update().filter(current_status='ASSIGNED', custodian__isnull=False).annotate(has_active=Exists(active)).filter(has_active=False)
        candidates = list(assets.values_list('pk', 'custodian_id'))
        self.stdout.write(f'{len(candidates)} current assignments have no active assignment record.')
        if not options['apply']:
            self.stdout.write('Preview only. No records were changed.')
            return
        AssetAssignment.objects.bulk_create([
            AssetAssignment(asset_id=asset_id, employee_id=employee_id, status='ASSIGNED',
                assigned_date=timezone.localdate(), assigned_by='Legacy reconciliation',
                purpose='Current custody reconciliation',
                remarks='Current custodian captured during reconciliation. Original assignment date is unknown; assigned_date records reconciliation date.')
            for asset_id, employee_id in candidates
        ])
        self.stdout.write(f'Created {len(candidates)} reconciliation records. Asset ownership and status were unchanged.')
