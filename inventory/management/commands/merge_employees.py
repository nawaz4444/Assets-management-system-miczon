from django.core.management.base import BaseCommand, CommandError

from inventory.models import (
    Employee, Asset, AssetAssignment, AssetHistory, AssetActionRequest,
    HealthCheckResponse, Department, Ticket,
)
from inventory.people_utils import merge_employee_into, normalize_name


class Command(BaseCommand):
    help = (
        "Merge duplicate employees. --pairs 'KEEP:MERGE,KEEP:MERGE' using employee_id "
        "codes (or numeric ids). Reassigns every record from MERGE to KEEP, then deletes "
        "MERGE. Dry-run unless --commit is passed."
    )

    def add_arguments(self, parser):
        parser.add_argument('--pairs', required=True, help="KEEP:MERGE comma-separated (employee_id codes or numeric ids)")
        parser.add_argument('--commit', action='store_true', help='Actually merge & delete (otherwise dry-run)')

    def _resolve(self, token):
        token = token.strip()
        emp = Employee.objects.filter(employee_id__iexact=token).first()
        if not emp and token.isdigit():
            emp = Employee.objects.filter(id=int(token)).first()
        if not emp:
            # Portable fallback: match by name (case-insensitive).
            matches = [e for e in Employee.objects.all() if normalize_name(e.name) == normalize_name(token)]
            if len(matches) == 1:
                emp = matches[0]
            elif len(matches) > 1:
                raise CommandError(f"Name '{token}' matches {len(matches)} employees — use the employee_id instead")
        return emp

    def handle(self, *args, **opts):
        commit = opts['commit']
        pairs = []
        for chunk in opts['pairs'].split(','):
            if not chunk.strip():
                continue
            if ':' not in chunk:
                raise CommandError(f"Bad pair '{chunk}' (expected KEEP:MERGE)")
            k, m = chunk.split(':', 1)
            keep, merge = self._resolve(k), self._resolve(m)
            if not keep:
                raise CommandError(f"KEEP not found: {k}")
            if not merge:
                raise CommandError(f"MERGE not found: {m}")
            if keep.id == merge.id:
                raise CommandError(f"KEEP and MERGE are the same: {k}")
            pairs.append((keep, merge))

        total_moves = 0
        for keep, merge in pairs:
            self.stdout.write(self.style.MIGRATE_HEADING(
                f"\nKEEP  {keep.name} ({keep.employee_id}, {keep.email})\n"
                f"MERGE {merge.name} ({merge.employee_id}, {merge.email})"
            ))
            moves = {
                'assets (custodian)': Asset.objects.filter(custodian=merge).count(),
                'assignments': AssetAssignment.objects.filter(employee=merge).count(),
                'history (from)': AssetHistory.objects.filter(from_employee=merge).count(),
                'history (to)': AssetHistory.objects.filter(to_employee=merge).count(),
                'requests (requester)': AssetActionRequest.objects.filter(requester=merge).count(),
                'requests (target)': AssetActionRequest.objects.filter(target_employee=merge).count(),
                'health responses': HealthCheckResponse.objects.filter(employee=merge).count(),
                'tickets (raised_by)': Ticket.objects.filter(raised_by=merge).count(),
                'tickets (raised_for)': Ticket.objects.filter(raised_for=merge).count(),
                'tickets (agent)': Ticket.objects.filter(assigned_agent=merge).count(),
                'departments managed': Department.objects.filter(manager=merge).count(),
                'agent groups': merge.agent_groups.count(),
            }
            for label, n in moves.items():
                if n:
                    self.stdout.write(f"    move {n} {label}")
                    total_moves += n

            if commit:
                merge_employee_into(keep, merge)
                self.stdout.write(self.style.SUCCESS(f"    merged & deleted {merge.employee_id}"))

        self.stdout.write(self.style.MIGRATE_HEADING(
            f"\n{'APPLIED' if commit else 'DRY-RUN'}: {len(pairs)} pair(s), {total_moves} record(s) to move."
        ))
        if not commit:
            self.stdout.write(self.style.NOTICE("Re-run with --commit to merge and delete the duplicates."))
