from collections import defaultdict

from django.core.management.base import BaseCommand

from inventory.models import Employee, Asset
from inventory.people_utils import normalize_name, is_placeholder_email, pick_keeper, merge_employee_into


# Prefixes that are sometimes present and sometimes dropped on the same person.
_PREFIXES = ('muhammad ', 'mohammad ', 'muhammed ', 'm ', 'md ')


def _strip_prefix(n):
    for p in _PREFIXES:
        if n.startswith(p):
            return n[len(p):]
    return n


class Command(BaseCommand):
    help = (
        "Find and merge duplicate employees by name. Auto-merges EXACT same-name "
        "duplicates (case-insensitive) — these are certain. Near-duplicates "
        "(e.g. 'Muhammad Ali' vs 'Ali') are only reported for you to review. "
        "Dry-run unless --commit is passed."
    )

    def add_arguments(self, parser):
        parser.add_argument('--commit', action='store_true', help='Actually merge the exact duplicates')

    def _assets(self, e):
        return Asset.objects.filter(custodian=e).count()

    def handle(self, *args, **opts):
        commit = opts['commit']
        employees = list(Employee.objects.all())

        # 1) Exact same-name groups (case-insensitive) — safe to auto-merge.
        exact = defaultdict(list)
        for e in employees:
            exact[normalize_name(e.name)].append(e)
        exact_groups = [v for v in exact.values() if len(v) > 1]

        merged_count = 0
        self.stdout.write(self.style.MIGRATE_HEADING(
            f"EXACT same-name duplicates: {len(exact_groups)} group(s)"
        ))
        for group in exact_groups:
            keep = pick_keeper(group)
            others = [e for e in group if e.id != keep.id]
            self.stdout.write(
                f"  KEEP {keep.name} ({keep.employee_id}, {keep.email}, assets={self._assets(keep)})"
            )
            for m in others:
                self.stdout.write(
                    f"    merge {m.name} ({m.employee_id}, {m.email}, assets={self._assets(m)})"
                )
                if commit:
                    merge_employee_into(keep, m)
                    merged_count += 1

        # 2) Near-duplicates (prefix-stripped name collides) — report only.
        near = defaultdict(list)
        for e in employees:
            near[_strip_prefix(normalize_name(e.name))].append(e)
        near_groups = []
        for key, members in near.items():
            # Only interesting if they aren't already an exact group.
            distinct_names = {normalize_name(m.name) for m in members}
            if len(members) > 1 and len(distinct_names) > 1:
                near_groups.append(members)

        self.stdout.write(self.style.MIGRATE_HEADING(
            f"\nLIKELY duplicates to REVIEW by hand: {len(near_groups)} group(s)"
        ))
        for group in near_groups:
            names = ', '.join(f"{e.name} ({e.employee_id})" for e in group)
            self.stdout.write(f"  ? {names}")
        if near_groups:
            self.stdout.write(self.style.NOTICE(
                "  Review these, then merge with: manage.py merge_employees --pairs \"KEEP:MERGE,...\""
            ))

        self.stdout.write(self.style.MIGRATE_HEADING(
            f"\n{'APPLIED' if commit else 'DRY-RUN'}: "
            f"{'merged ' + str(merged_count) if commit else str(sum(len(g) - 1 for g in exact_groups)) + ' exact duplicate(s) would be merged'}; "
            f"{len(near_groups)} group(s) need manual review."
        ))
        if not commit and exact_groups:
            self.stdout.write(self.style.NOTICE("Re-run with --commit to merge the exact duplicates."))
