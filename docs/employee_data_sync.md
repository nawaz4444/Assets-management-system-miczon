# Syncing employee emails & removing duplicates (prod)

The dev database changes (emails, merges) do **not** transfer to production — prod
has its own data and its own employee IDs. But the **tools do** transfer with the
code. So on prod you re-run the same two commands against prod's own records.

Everything below is **name-based**, so it works on any database without dev IDs.
Every command is a **dry-run by default** and only writes with `--commit`.

## 0. Back up the database first
Destructive steps (dedupe) delete records. Take a DB backup/snapshot before step 3.

## 1. Deploy the code
Run migrations — they create the ticket tables/columns and seed the ticket
categories & types automatically. Safe and idempotent.

```
python manage.py migrate
```

## 2. Sync real emails (from the Google Workspace export)
Export users from Google Admin → Directory → Users → Download (CSV or XLSX; it has
First Name / Last Name / Email columns). Then:

```
# preview — matches employees by name, shows every old -> new change
python manage.py import_employee_emails "User_Download.xlsx"

# apply
python manage.py import_employee_emails "User_Download.xlsx" --commit
```

- Exact name matches are applied automatically (the email literally spells the name).
- `unmatched` rows are people whose app name differs from Google (spelling / middle
  name / "Muhammad" prefix) or role aliases (ceo@, dev@). Fix those by hand (step 4).
- Placeholder `unknown-*@miczon.com` addresses are never emailed by the app.

## 3. Remove duplicate employees
```
# preview
python manage.py dedupe_employees

# apply — auto-merges only EXACT same-name duplicates (certain), moving all
# their assets/tickets/requests to the kept record first, then deleting the dup
python manage.py dedupe_employees --commit
```

`dedupe_employees` also prints **"LIKELY duplicates to REVIEW"** — near-matches like
`Muhammad Jahanzaib` vs `Jahanzaib`. These need a human. After checking, merge them
by name (portable):

```
python manage.py merge_employees --pairs "Jahanzaib:Muhammad Jahanzaib,Faisal:Muhammad Faisal"
python manage.py merge_employees --pairs "Jahanzaib:Muhammad Jahanzaib" --commit
```
(KEEP:MERGE — the left name is kept, the right is merged into it and deleted.
Accepts employee_id codes too if a name is ambiguous.)

## 4. Hand-fix the remainder
In the employee screen, set emails for anyone the export didn't match, and
deactivate/skip people who have left (leave their asset history intact).

## Why duplicates happened
A second bulk load (asset-custodian / data import) created new employee records
under the catch-all **"Office"** department for people already in the system,
because names differed in case/spelling/prefix and never matched. The dedupe tools
above collapse those back to one record per person.
