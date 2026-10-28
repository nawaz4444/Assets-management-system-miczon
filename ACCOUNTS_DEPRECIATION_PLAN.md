# Accounts / Asset Depreciation — Implementation Plan

**Status:** proposed (awaiting approval — no code written yet)
**Date:** 2026-09-04

## 1. Decisions (locked)

| Topic | Decision |
|---|---|
| Scope | Fixed-asset register + reports. **No** GL / double-entry journals. |
| Method | Reducing balance (WDV). |
| Period | Monthly. |
| Monthly charge | Simple pro-rata: `depreciation = NBV × (annual_rate ÷ 12)`. |
| Stop rule | Never depreciate below the asset's `salvage_value`. |
| Rate source | Default per `SuperCategory` (`DepreciationPolicy`) + optional per-asset override. |
| Data home | New `accounts` app. Acquisition facts (`purchase_price`, `purchase_date`) stay on `Asset` (already built). |
| Currency | PKR (all money = `DecimalField`, never float). |
| Ledger | Persisted, immutable monthly entries (not on-the-fly). |

## 2. New Django app: `accounts`

Keeps money/policy/ledger separate from inventory's custody/repair concerns. Register in `INSTALLED_APPS`, own `urls.py` mounted under `/api/accounts/` (or `/api/` alongside others — TBD to match existing router style).

## 3. Data model

### 3.1 `DepreciationPolicy` (FK → `SuperCategory`, unique)
- `super_category` — one policy per category.
- `annual_rate` — Decimal %, e.g. 33.33 for IT.
- `salvage_percent` — Decimal %, default salvage as % of cost (e.g. 5).
- `is_active`.

### 3.2 `AssetFinancial` (OneToOne → `Asset`)
Accounting layer for one asset. Acquisition cost/date are **read from `Asset`** (not duplicated).
- `asset` (OneToOne).
- `in_service_date` — when depreciation starts (defaults to `Asset.purchase_date`).
- `salvage_value` — Decimal (defaults from policy `salvage_percent × cost`).
- `annual_rate_override` — nullable; when null, use the category policy.
- `is_depreciable` — bool (default true; false = land, fully-written-off, or intentionally excluded).
- `opening_accumulated_depreciation` — Decimal default 0 (for assets already partly depreciated before go-live).
- Computed properties (not stored): `effective_rate`, `depreciable_cost`, `current_nbv` (from latest entry).

**Derived, read-only:** `cost = asset.purchase_price`. An asset is depreciable only when `purchase_price` and `in_service_date` are both set and `is_depreciable` is true.

### 3.3 `DepreciationRun`
One monthly batch.
- `period_year`, `period_month` (unique together).
- `status` — DRAFT / POSTED.
- `run_by` (FK auth.User), `created_at`, `posted_at`.
- `notes`.

### 3.4 `DepreciationEntry` (FK → run, FK → `AssetFinancial`) — **immutable**
One row per asset per posted month.
- `opening_nbv`, `depreciation_amount`, `accumulated_depreciation`, `closing_nbv` (all Decimal).
- `period_year`, `period_month` (denormalized for fast reporting).
- unique_together (`asset_financial`, `period_year`, `period_month`) — prevents double-posting.

### 3.5 `AssetDisposal` (OneToOne → `AssetFinancial`)
- `disposal_date`, `method` (SOLD / SCRAPPED / LOST / WRITTEN_OFF), `proceeds` (Decimal).
- `nbv_at_disposal` (snapshot), `gain_loss` (= proceeds − nbv_at_disposal).
- On disposal the asset stops appearing in future runs.

## 4. Depreciation engine

Pure, unit-tested function — no DB inside:
```
compute_monthly_wdv(opening_nbv, annual_rate, salvage_value) -> depreciation_amount
    raw = opening_nbv * (annual_rate / 12)
    # never cross the salvage floor
    return max(min(raw, opening_nbv - salvage_value), 0)
```
Rounded to 2 decimals (PKR). `opening_nbv` for the first-ever entry = `purchase_price − opening_accumulated_depreciation`; thereafter = previous entry's `closing_nbv`.

### Run orchestration (`services.py`)
`run_depreciation(year, month, user, commit=False)`:
1. Select every `AssetFinancial` that is depreciable, in service on/before the period, not disposed, and not already posted for that period.
2. For each: opening_nbv = last entry's closing_nbv (or initial), compute amount, build entry.
3. `commit=False` → return a **preview** (list of proposed entries) without saving.
4. `commit=True` → create `DepreciationRun` + `DepreciationEntry` rows atomically. **Idempotent** (unique constraint blocks re-posting a month).

Exposed via both a management command (`python manage.py run_depreciation --year --month [--commit]`) and an API endpoint.

## 5. API (DRF)

- `GET/POST /depreciation-policies/` — CRUD (admin).
- `GET/PATCH /asset-financials/` — CRUD; auto-created lazily for assets with purchase data.
- `POST /depreciation-runs/preview/` — `{year, month}` → proposed entries, no save.
- `POST /depreciation-runs/` — post a month (commit).
- `GET /depreciation-runs/` + `GET /depreciation-entries/?year=&month=&department=` — history.
- `POST /asset-disposals/` — record a disposal.
- Reports:
  - `GET /reports/depreciation-register/?as_of=YYYY-MM` — per asset: cost, accumulated, NBV.
  - `GET /reports/nbv-summary/?group_by=department|category`.
  - `GET /reports/monthly-expense/?year=` — depreciation expense per month.
  - Excel export of the register (reuse existing openpyxl pattern).

Permissions: writes admin-only (later: an "Accounts" group). Reads admin/manager.

## 6. Frontend

New **Accounts** section in the sidebar (`navItems` + routes in `pages/`), matching the existing MUI/AppShell style:
1. **Asset Financials** — table of assets with cost/rate/salvage/NBV; inline edit; badge for "missing purchase data".
2. **Depreciation Policies** — per-category rate + salvage defaults.
3. **Run Depreciation** — pick month → **Preview** table → **Post**. Shows already-posted months.
4. **Reports** — depreciation register, NBV by department/category, monthly expense; Excel download.
5. **Disposals** — record sale/scrap, show gain/loss.

Same filter-persistence pattern (`sessionStorage`) as the other list screens.

## 7. Data readiness / backfill

- Assets lacking `purchase_price`/`purchase_date` are surfaced as **"Not depreciable — missing purchase data"** and excluded from runs.
- Backfill via the existing Excel export → fill columns → import round-trip.
- `opening_accumulated_depreciation` lets you onboard assets that were already in use before go-live without back-dating months.

## 8. Testing

- `accounts/tests.py` (DRF `APITestCase` + pure-function unit tests):
  - `compute_monthly_wdv`: normal month, salvage floor clamp, zero/again at floor.
  - Run idempotency (re-posting a month is a no-op).
  - NBV continuity across consecutive months.
  - Disposal gain/loss.
  - Assets without purchase data are skipped.

## 9. Phased delivery (each phase independently reviewable)

- **Phase 1 — Models + migration + admin.** `accounts` app, all models, Django admin. Verify in admin, no UI yet.
- **Phase 2 — Engine + management command + tests.** Compute + run logic, preview/commit, full test suite. Verify from CLI.
- **Phase 3 — API.** Serializers, viewsets, report endpoints.
- **Phase 4 — Frontend.** Accounts section, run screen, reports.
- **Phase 5 — Polish.** Excel export of register, permissions group, disposals UI.

## 10. Open items to confirm before Phase 1

1. URL mount: `/api/accounts/...` vs flat `/api/...` (match current router).
2. Default annual rates per category to seed (IT %, Furniture %, Appliances %) — or leave blank for you to set in the policies screen.
3. Financial year start (Jan vs Jul) — only affects report grouping/labels, not the monthly math.
