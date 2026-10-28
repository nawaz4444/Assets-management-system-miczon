import csv
import os

from django.core.management.base import BaseCommand, CommandError

from inventory.models import Employee


def _norm(s):
    return ' '.join((s or '').strip().lower().split())


def _read_rows(path, encoding):
    """Return (fieldnames, list_of_row_dicts) from a .csv or .xlsx file."""
    ext = os.path.splitext(path)[1].lower()
    if ext in ('.xlsx', '.xls'):
        try:
            import pandas as pd
        except ImportError:
            raise CommandError("Reading .xlsx needs pandas/openpyxl; or save the file as CSV.")
        df = pd.read_excel(path, dtype=str).fillna('')
        fieldnames = [str(c) for c in df.columns]
        rows = [{str(k): ('' if v is None else str(v)) for k, v in rec.items()} for rec in df.to_dict('records')]
        return fieldnames, rows
    try:
        f = open(path, newline='', encoding=encoding)
    except OSError as e:
        raise CommandError(f"Cannot open file: {e}")
    with f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
            raise CommandError("CSV has no header row.")
        return list(reader.fieldnames), list(reader)


class Command(BaseCommand):
    help = (
        "Sync real employee emails from a CSV or XLSX (e.g. a Google Workspace "
        "export). Matches each row to an Employee by employee_id (if present) or "
        "by full name, and updates the email. Dry-run unless --commit is passed."
    )

    def add_arguments(self, parser):
        parser.add_argument('path', help='Path to the CSV or XLSX file')
        parser.add_argument('--commit', action='store_true', help='Actually write changes (otherwise dry-run)')
        parser.add_argument('--encoding', default='utf-8-sig', help='CSV encoding (default utf-8-sig)')

    def handle(self, *args, **opts):
        commit = opts['commit']
        fieldnames, records = _read_rows(opts['path'], opts['encoding'])
        headers = {h.lower().strip(): h for h in fieldnames}

        email_col = next((headers[h] for h in headers if 'email' in h), None)
        if not email_col:
            raise CommandError(f"No email column found. Headers: {fieldnames}")
        id_col = next((headers[h] for h in headers if h in ('employee_id', 'employee id', 'emp_id', 'id')), None)
        name_col = next((headers[h] for h in headers if h in ('name', 'full name', 'employee', 'employee name')), None)
        first_col = next((headers[h] for h in headers if 'first' in h and 'name' in h), None)
        last_col = next((headers[h] for h in headers if 'last' in h and 'name' in h), None)

        if not (id_col or name_col or (first_col and last_col)):
            raise CommandError("Need an employee_id column, a name column, or first+last name columns to match on.")

        updated = unchanged = unmatched = ambiguous = invalid = 0
        problems = []

        for i, row in enumerate(records, start=2):
            email = (row.get(email_col) or '').strip()
            if not email or '@' not in email:
                invalid += 1
                continue

            emp = None
            if id_col and (row.get(id_col) or '').strip():
                emp = Employee.objects.filter(employee_id__iexact=row[id_col].strip()).first()

            if not emp:
                if name_col:
                    full = _norm(row.get(name_col))
                elif first_col and last_col:
                    full = _norm(f"{row.get(first_col, '')} {row.get(last_col, '')}")
                else:
                    full = ''
                if full:
                    matches = [e for e in Employee.objects.all() if _norm(e.name) == full]
                    if len(matches) == 1:
                        emp = matches[0]
                    elif len(matches) > 1:
                        ambiguous += 1
                        problems.append(f"  row {i}: '{row.get(name_col) or full}' matches {len(matches)} employees — skipped")
                        continue

            if not emp:
                unmatched += 1
                problems.append(f"  row {i}: no match for '{row.get(name_col) or row.get(id_col) or email}'")
                continue

            if (emp.email or '').strip().lower() == email.lower():
                unchanged += 1
                continue

            self.stdout.write(f"  {emp.name}: {emp.email!r} -> {email!r}")
            if commit:
                emp.email = email
                emp.save(update_fields=['email'])
            updated += 1

        self.stdout.write(self.style.MIGRATE_HEADING(f"\n{'APPLIED' if commit else 'DRY-RUN'} summary:"))
        self.stdout.write(
            f"  to update: {updated} | unchanged: {unchanged} | unmatched: {unmatched} | "
            f"ambiguous: {ambiguous} | invalid email: {invalid}"
        )
        if problems:
            self.stdout.write(self.style.WARNING("Problems:"))
            for p in problems[:60]:
                self.stdout.write(p)
            if len(problems) > 60:
                self.stdout.write(f"  ...and {len(problems) - 60} more")
        if not commit and updated:
            self.stdout.write(self.style.NOTICE("\nRe-run with --commit to apply these changes."))
