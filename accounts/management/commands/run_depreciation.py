from datetime import date

from django.core.management.base import BaseCommand, CommandError

from accounts.services import run_depreciation


class Command(BaseCommand):
    help = "Compute (and optionally post) monthly WDV depreciation for a given period."

    def add_arguments(self, parser):
        today = date.today()
        parser.add_argument('--year', type=int, default=today.year, help="Period year (default: current)")
        parser.add_argument('--month', type=int, default=today.month, help="Period month 1-12 (default: current)")
        parser.add_argument('--commit', action='store_true',
                            help="Persist the run. Without this flag it is a dry-run preview.")

    def handle(self, *args, **opts):
        year, month, commit = opts['year'], opts['month'], opts['commit']
        if not (1 <= month <= 12):
            raise CommandError("month must be between 1 and 12")

        result = run_depreciation(year, month, user=None, commit=commit)

        header = f"Depreciation {year}-{month:02d}"
        if result['already_posted']:
            self.stdout.write(self.style.WARNING(
                f"{header}: already posted (run #{result['run_id']}) — {result['count']} entries, "
                f"total {result['total_depreciation']}. Nothing changed."
            ))
            return

        for line in result['lines']:
            self.stdout.write(
                f"  {line['miczon_id']:<20} open {line['opening_nbv']:>12} "
                f"- dep {line['depreciation_amount']:>10} = close {line['closing_nbv']:>12}"
            )

        mode = "POSTED" if result['committed'] else "PREVIEW (dry-run, use --commit to post)"
        style = self.style.SUCCESS if result['committed'] else self.style.NOTICE
        self.stdout.write(style(
            f"{header}: {mode} — {result['count']} assets, total depreciation {result['total_depreciation']}"
            + (f", run #{result['run_id']}" if result['run_id'] else "")
        ))
