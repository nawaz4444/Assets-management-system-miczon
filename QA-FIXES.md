# Inventory QA fixes — 4 September 2026

The QA defects are addressed in the backend and frontend. Browser regression testing uses a separate database containing synthetic QA accounts and assets.

## Changes

- Selected returns validate and return only the selected assets, atomically.
- Stock movements reject zero/negative quantities, insufficient stock and unknown products. Batch edits/deletes are atomic, and reads no longer seed sample data.
- Asset edits, approved requests and imports synchronize the active assignment ledger; a database constraint permits only one active assignment per asset.
- Inspection sessions capture their targets. Returns/transfers do not remove completed inspections or change new sessions' denominators.
- Furniture/appliance answers persist and render with the correct labels. Reports and Excel exports share category/team scope. Irrelevant IT columns are blank in non-IT exports.
- Managers can inspect their team and submit validated asset requests. Employee inspection prompts open the most recent open session automatically.
- Imports preserve super category and validate email/status. The legacy upload endpoint now returns a validated preview; commit through `/api/assets/bulk-commit/`.
- Request processing, session controls and history mutations have explicit permission checks. User/employee matching no longer relies on names.
- Login retains internal scan destinations and waits for the authenticated profile before choosing routes. Unauthorized Edit controls are hidden.
- Repeated route reads are cached and deduplicated, sidebar navigation warms key requests, Accounts financial calculations avoid per-row queries, large financial tables are paginated, and stock summaries no longer download full transaction history.
- Stock reports use local calendar dates and generate actual PDF files. Mobile inventory controls wrap, and tables scroll within their containers.
- Password reset supports expiring single-use links, password validation, request throttling and revocation of old API tokens.
- Frontend lint failures were resolved and compatible dependency updates eliminated the reported npm advisories.

## Local setup

The broken `.venv` was preserved at `.qa/legacy-venv`; a new `.venv` uses Python 3.14 and the pinned requirements, including Django 6.0.1. The schema-only migration `0022_qa_integrity` is applied to the local SQLite database. Backup: `.qa/db-before-qa-schema-20260904-210202.sqlite3`.

Run the backend with `.venv/Scripts/python.exe manage.py runserver 127.0.0.1:8000` and the frontend with `npm run dev` inside `frontend`. Set `USE_SQLITE=true` when using the local SQLite database. `VITE_BACKEND_BASE` can override the backend origin; the default local origin uses the browser's hostname.

## Remaining data/configuration work

Read-only audit found **235** assets with custodians but no matching active assignment rows: **234** are marked Assigned and **1** is marked Available. No duplicates, wrong-custodian active rows, uncategorized assets, negative stock balances or nonpositive stock movements were found. Automatic approval review rejected the proposed legacy-data rewrite, so it has not been applied.

The concrete repair is prepared as `manage.py reconcile_assignments`. Its read-only preview identifies **234** rows. After approval, `--apply` adds one active row for each currently assigned asset with no active row, using its existing custodian. Rows are explicitly labelled as reconciliation records with an unknown original assignment date; ownership, asset status and past events are unchanged. The command is atomic and idempotent. The remaining asset is **test3** (name: **test**), marked Available while retaining a custodian. Its correct custody/status needs review and it is excluded from this repair.

Previously dropped inspection answers and original targets of legacy sessions cannot be reconstructed from missing data. Legacy reports preserve recorded responses and use a documented current-assignment fallback for unrecorded targets; new sessions use immutable snapshots.

For production recovery email, configure `FRONTEND_URL`, `DEFAULT_FROM_EMAIL`, `EMAIL_BACKEND=django.core.mail.backends.smtp.EmailBackend`, `EMAIL_HOST`, `EMAIL_PORT`, `EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD`, and the appropriate TLS/SSL option. Development uses the console email backend. Google OAuth and live email delivery require configured external services and were not exercised against real accounts.

## Verification commands

Verified: the full **79-test backend suite**, **5 frontend tests**, clean ESLint, successful production build, no missing migrations, no broken Python requirements, and **0 npm vulnerabilities**. Calendar tests also passed with `TZ=Asia/Karachi`.

Browser regressions passed for employee scan/login navigation; damaged furniture submission and detail/critical displays; category switching; manager team compliance; manager Add Asset submission and admin approval; selected return of one out of three assets; retained inspection history after return; stock oversell rejection and valid issue; current/previous month dates; and mobile inventory at 390px (document width 375px including scrollbar allowance, table content scrolls inside its 309px container).

Downloaded Excel was reopened: target 2, completed 1, pending 1, critical 1, completion 50%, with the damaged furniture answers intact. Downloaded stock PDF was reopened and rendered: product QA-PEN, stock 3, reorder 2. Browser download-event notifications timed out, but both actual downloaded files were verified on disk.

```powershell
$env:USE_SQLITE='true'
.venv/Scripts/python.exe manage.py test inventory stock_management --noinput
.venv/Scripts/python.exe manage.py makemigrations --check --dry-run
.venv/Scripts/python.exe manage.py reconcile_assignments
.venv/Scripts/python.exe scripts/audit_integrity.py
```

Inside `frontend`: `npm run lint`, `npm test`, `npm run build`, and `npm audit`.
