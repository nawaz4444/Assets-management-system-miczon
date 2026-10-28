import React, { useState, useEffect, useCallback, useContext, useRef } from 'react';
import { SuperCategoryContext } from '../lib/contexts';
import { normalizeList, fetchAll, apiError } from '../lib/api';
import {
  Button, Select, Dialog, DialogContent, DialogHeader, PageHeader,
  Field, Notice, DataTable, StatusBadge,
} from '../components/ui';

const money = (n) =>
  n === null || n === undefined || n === '' ? '—' : `Rs ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const pct = (n) => (n === null || n === undefined || n === '' ? '—' : `${Number(n)}%`);

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const TABS = [
  { key: 'financials', label: 'Asset Financials' },
  { key: 'policies', label: 'Policies' },
  { key: 'run', label: 'Run Depreciation' },
  { key: 'reports', label: 'Reports' },
  { key: 'disposals', label: 'Disposals' },
];
const FINANCIALS_PAGE_SIZE = 50;

export function AccountsPage({ api }) {
  const [tab, setTab] = useState(() => {
    try { return sessionStorage.getItem('accounts:tab') || 'financials'; } catch { return 'financials'; }
  });
  const [visitedTabs, setVisitedTabs] = useState(() => new Set([tab]));
  const selectTab = (key) => {
    setTab(key);
    setVisitedTabs((current) => current.has(key) ? current : new Set([...current, key]));
    try { sessionStorage.setItem('accounts:tab', key); } catch { /* ignore */ }
  };

  return (
    <>
      <PageHeader eyebrow="Accounts" title="Asset Depreciation">
        <div className="tab-bar" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {TABS.map((t) => (
            <Button
              key={t.key}
              type="button"
              size="sm"
              variant={tab === t.key ? 'primary' : 'outline'}
              onClick={() => selectTab(t.key)}
            >
              {t.label}
            </Button>
          ))}
        </div>
      </PageHeader>

      {visitedTabs.has('financials') && <div hidden={tab !== 'financials'}><FinancialsTab api={api} /></div>}
      {visitedTabs.has('policies') && <div hidden={tab !== 'policies'}><PoliciesTab api={api} /></div>}
      {visitedTabs.has('run') && <div hidden={tab !== 'run'}><RunTab api={api} /></div>}
      {visitedTabs.has('reports') && <div hidden={tab !== 'reports'}><ReportsTab api={api} /></div>}
      {visitedTabs.has('disposals') && <div hidden={tab !== 'disposals'}><DisposalsTab api={api} /></div>}
    </>
  );
}

// ---------------------------------------------------------------------------
// Asset Financials
// ---------------------------------------------------------------------------
function FinancialsTab({ api }) {
  const saved = (() => { try { return JSON.parse(sessionStorage.getItem('accounts:filters')) || {}; } catch { return {}; } })();
  const [rows, setRows] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState(saved.search || '');
  const [debouncedSearch, setDebouncedSearch] = useState(saved.search || '');
  const [departmentFilter, setDepartmentFilter] = useState(saved.departmentFilter || '');
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);
  const latestRequest = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);

  const load = useCallback(() => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    const params = new URLSearchParams({ page: String(page), page_size: String(FINANCIALS_PAGE_SIZE) });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (departmentFilter) params.set('department', departmentFilter);
    return api.get(`/accounts/asset-financials/?${params.toString()}`)
      .then((res) => {
        if (requestId !== latestRequest.current) return;
        const resultRows = normalizeList(res.data);
        setRows(resultRows);
        setTotalCount(res.data?.count ?? resultRows.length);
      })
      .catch(() => {
        if (requestId === latestRequest.current) setNotice('Unable to load asset financials.');
      })
      .finally(() => {
        if (requestId === latestRequest.current) setLoading(false);
      });
  }, [api, debouncedSearch, departmentFilter, page]);

  useEffect(() => {
    // Loading state belongs to this request cycle and intentionally starts when its filters change.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);
  useEffect(() => { fetchAll(api, '/departments/').then(setDepartments); }, [api]);
  useEffect(() => {
    try { sessionStorage.setItem('accounts:filters', JSON.stringify({ search, departmentFilter })); } catch { /* ignore */ }
  }, [search, departmentFilter]);

  const totalPages = Math.ceil(totalCount / FINANCIALS_PAGE_SIZE);

  const initFinancials = async () => {
    try {
      const res = await api.post('/accounts/asset-financials/bulk-init/');
      setNotice(`${res.data.created} asset financial record(s) created from assets with purchase data.`);
      load();
    } catch (err) {
      setNotice(apiError(err, 'Unable to initialize financials.'));
    }
  };

  return (
    <section className="panel" style={{ position: 'relative' }}>
      {notice && <Notice>{notice}</Notice>}
      <div className="panel-heading">
        <div>
          <h2>Asset Financials</h2>
          <p className="panel-subtitle">{totalCount} record(s). Cost/date come from the asset; rate & salvage from the category policy unless overridden.</p>
        </div>
        <Button type="button" variant="primary" onClick={initFinancials}>Initialize from Assets</Button>
      </div>

      <div className="filter-bar">
        <input className="search" placeholder="Search Miczon ID or device..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <Select value={departmentFilter} onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}>
          <option value="">All Departments</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
        <Button type="button" variant="ghost" onClick={() => { setSearch(''); setDepartmentFilter(''); setPage(1); }}>Reset</Button>
      </div>

      <DataTable
        columns={['Miczon ID', 'Device', 'Cost', 'Rate', 'Salvage', 'Accumulated', 'Net Book Value', 'State', '']}
        rows={rows.map((r) => [
          r.miczon_id,
          r.asset_name,
          money(r.cost),
          pct(r.effective_rate),
          money(r.effective_salvage),
          money(r.accumulated_depreciation),
          <strong>{money(r.current_nbv)}</strong>,
          r.is_disposed
            ? <StatusBadge status="Disposed" />
            : (r.is_ready ? <StatusBadge status="Available" /> : <span style={{ fontSize: '12px', color: '#b45309' }}>Missing data</span>),
          <Button key="e" type="button" variant="outline" size="sm" onClick={() => setEditing(r)}>Edit</Button>,
        ])}
        empty={loading ? 'Loading...' : 'No financial records yet. Use "Initialize from Assets" to create them for assets that have a purchase price.'}
      />

      {totalPages > 1 && (
        <div className="pagination-bar">
          <Button type="button" variant="ghost" size="sm" disabled={page <= 1 || loading} onClick={() => setPage((current) => current - 1)}>Previous</Button>
          <span className="pagination-info">Page {page} of {totalPages} · {totalCount} records</span>
          <Button type="button" variant="ghost" size="sm" disabled={page >= totalPages || loading} onClick={() => setPage((current) => current + 1)}>Next</Button>
        </div>
      )}

      {editing && (
        <FinancialEditor
          api={api}
          financial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </section>
  );
}

function FinancialEditor({ api, financial, onClose, onSaved }) {
  const [form, setForm] = useState({
    in_service_date: financial.in_service_date || '',
    salvage_value: financial.salvage_value ?? '',
    annual_rate_override: financial.annual_rate_override ?? '',
    is_depreciable: financial.is_depreciable,
    opening_accumulated_depreciation: financial.opening_accumulated_depreciation ?? '0',
  });
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      in_service_date: form.in_service_date || null,
      salvage_value: form.salvage_value === '' ? null : form.salvage_value,
      annual_rate_override: form.annual_rate_override === '' ? null : form.annual_rate_override,
      is_depreciable: form.is_depreciable,
      opening_accumulated_depreciation: form.opening_accumulated_depreciation === '' ? '0' : form.opening_accumulated_depreciation,
    };
    try {
      await api.patch(`/accounts/asset-financials/${financial.id}/`, payload);
      onSaved();
    } catch (err) {
      setError(apiError(err, 'Unable to save.'));
    }
  };

  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader title={`Financials — ${financial.miczon_id}`} description={`${financial.asset_name} · cost ${money(financial.cost)}`} />
        <form className="dialog-form" onSubmit={submit}>
          {error && <Notice tone="error">{error}</Notice>}
          <Field label="In-service date (defaults to purchase date)">
            <input type="date" value={form.in_service_date || ''} onChange={(e) => setForm({ ...form, in_service_date: e.target.value })} />
          </Field>
          <Field label="Salvage value (PKR, blank = from policy %)">
            <input type="number" min="0" step="0.01" value={form.salvage_value ?? ''} onChange={(e) => setForm({ ...form, salvage_value: e.target.value })} placeholder="e.g. 5000" />
          </Field>
          <Field label="Annual rate override % (blank = category policy)">
            <input type="number" min="0" step="0.01" value={form.annual_rate_override ?? ''} onChange={(e) => setForm({ ...form, annual_rate_override: e.target.value })} placeholder="e.g. 33.33" />
          </Field>
          <Field label="Opening accumulated depreciation (for pre-owned assets)">
            <input type="number" min="0" step="0.01" value={form.opening_accumulated_depreciation ?? ''} onChange={(e) => setForm({ ...form, opening_accumulated_depreciation: e.target.value })} />
          </Field>
          <Field label="Depreciable?">
            <Select value={form.is_depreciable ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, is_depreciable: e.target.value === 'yes' })}>
              <option value="yes">Yes — include in depreciation runs</option>
              <option value="no">No — exclude</option>
            </Select>
          </Field>
          <div className="dialog-footer">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary">Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------
function PoliciesTab({ api }) {
  const { superCategories } = useContext(SuperCategoryContext);
  const [policies, setPolicies] = useState([]);
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState(null);

  const load = useCallback(() => {
    api.get('/accounts/policies/').then((res) => setPolicies(normalizeList(res.data))).catch(() => setNotice('Unable to load policies.'));
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const emptyPolicy = { super_category: '', annual_rate: '', salvage_percent: '0', is_active: true };

  return (
    <section className="panel">
      {notice && <Notice>{notice}</Notice>}
      <div className="panel-heading">
        <div>
          <h2>Depreciation Policies</h2>
          <p className="panel-subtitle">Default annual WDV rate & salvage % per category.</p>
        </div>
        <Button type="button" variant="primary" onClick={() => setEditing(emptyPolicy)}>Add Policy</Button>
      </div>

      <DataTable
        columns={['Category', 'Annual Rate', 'Salvage %', 'Active', '']}
        rows={policies.map((p) => [
          p.super_category_name,
          pct(p.annual_rate),
          `${Number(p.salvage_percent)}%`,
          p.is_active ? 'Yes' : 'No',
          <Button key="e" type="button" variant="outline" size="sm" onClick={() => setEditing(p)}>Edit</Button>,
        ])}
        empty="No policies yet. Add one per category (e.g. IT Assets 33.33%)."
      />

      {editing && (
        <PolicyEditor
          api={api}
          policy={editing}
          superCategories={superCategories}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </section>
  );
}

function PolicyEditor({ api, policy, superCategories, onClose, onSaved }) {
  const isNew = !policy.id;
  const [form, setForm] = useState({
    super_category: policy.super_category || '',
    annual_rate: policy.annual_rate ?? '',
    salvage_percent: policy.salvage_percent ?? '0',
    is_active: policy.is_active ?? true,
  });
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    const payload = {
      super_category: form.super_category,
      annual_rate: form.annual_rate,
      salvage_percent: form.salvage_percent === '' ? '0' : form.salvage_percent,
      is_active: form.is_active,
    };
    try {
      if (isNew) await api.post('/accounts/policies/', payload);
      else await api.patch(`/accounts/policies/${policy.id}/`, payload);
      onSaved();
    } catch (err) {
      setError(apiError(err, 'Unable to save policy.'));
    }
  };

  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader title={isNew ? 'Add Policy' : `Edit Policy — ${policy.super_category_name}`} />
        <form className="dialog-form" onSubmit={submit}>
          {error && <Notice tone="error">{error}</Notice>}
          <Field label="Category">
            <Select value={form.super_category} onChange={(e) => setForm({ ...form, super_category: e.target.value })} disabled={!isNew} required>
              <option value="">Select a category</option>
              {superCategories.map((sc) => <option key={sc.id} value={sc.id}>{sc.name}</option>)}
            </Select>
          </Field>
          <Field label="Annual WDV rate (%)">
            <input type="number" min="0" step="0.01" required value={form.annual_rate} onChange={(e) => setForm({ ...form, annual_rate: e.target.value })} placeholder="e.g. 33.33" />
          </Field>
          <Field label="Salvage value (% of cost)">
            <input type="number" min="0" step="0.01" value={form.salvage_percent} onChange={(e) => setForm({ ...form, salvage_percent: e.target.value })} placeholder="e.g. 5" />
          </Field>
          <Field label="Active?">
            <Select value={form.is_active ? 'yes' : 'no'} onChange={(e) => setForm({ ...form, is_active: e.target.value === 'yes' })}>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <div className="dialog-footer">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary">Save</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Run Depreciation
// ---------------------------------------------------------------------------
function RunTab({ api }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [preview, setPreview] = useState(null);
  const [runs, setRuns] = useState([]);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const loadRuns = useCallback(() => {
    api.get('/accounts/runs/').then((res) => setRuns(normalizeList(res.data))).catch(() => {});
  }, [api]);
  useEffect(() => { loadRuns(); }, [loadRuns]);

  const doPreview = async () => {
    setBusy(true); setNotice('');
    try {
      const res = await api.post('/accounts/runs/preview/', { year, month });
      setPreview(res.data);
      if (res.data.already_posted) setNotice(`${year}-${String(month).padStart(2, '0')} is already posted.`);
    } catch (err) {
      setNotice(apiError(err, 'Preview failed.'));
    } finally { setBusy(false); }
  };

  const doPost = async () => {
    if (!window.confirm(`Post depreciation for ${MONTHS[month - 1]} ${year}? This creates a permanent ledger entry.`)) return;
    setBusy(true); setNotice('');
    try {
      const res = await api.post('/accounts/runs/', { year, month });
      setNotice(`Posted: ${res.data.count} assets, total ${money(res.data.total_depreciation)} (run #${res.data.run_id}).`);
      setPreview(null);
      loadRuns();
    } catch (err) {
      setNotice(apiError(err, 'Posting failed.'));
    } finally { setBusy(false); }
  };

  const years = [];
  for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 6; y--) years.push(y);

  return (
    <>
      <section className="panel">
        {notice && <Notice>{notice}</Notice>}
        <div className="panel-heading"><div><h2>Run Monthly Depreciation</h2><p className="panel-subtitle">Preview first, then post. A month can only be posted once.</p></div></div>
        <div className="filter-bar">
          <Select value={month} onChange={(e) => { setMonth(Number(e.target.value)); setPreview(null); }}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Select>
          <Select value={year} onChange={(e) => { setYear(Number(e.target.value)); setPreview(null); }}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Button type="button" variant="outline" onClick={doPreview} disabled={busy}>Preview</Button>
          {preview && !preview.already_posted && preview.count > 0 && (
            <Button type="button" variant="primary" onClick={doPost} disabled={busy}>Post {preview.count} entries</Button>
          )}
        </div>

        {preview && (
          <>
            <p className="panel-subtitle" style={{ marginTop: '0.5rem' }}>
              {preview.count} asset(s) · total depreciation <strong>{money(preview.total_depreciation)}</strong>
              {preview.already_posted ? ' · already posted' : ' · preview only'}
            </p>
            <DataTable
              columns={['Miczon ID', 'Opening NBV', 'Depreciation', 'Closing NBV']}
              rows={preview.lines.map((l) => [l.miczon_id, money(l.opening_nbv), <strong>{money(l.depreciation_amount)}</strong>, money(l.closing_nbv)])}
              empty="No eligible assets for this period."
            />
          </>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading"><div><h2>Posted Runs</h2></div></div>
        <DataTable
          columns={['Period', 'Status', 'Entries', 'Total Depreciation', 'Posted At', 'By']}
          rows={runs.map((r) => [
            `${MONTHS[r.period_month - 1]} ${r.period_year}`,
            <StatusBadge status={r.status} />,
            r.entry_count,
            money(r.total_depreciation),
            r.posted_at ? new Date(r.posted_at).toLocaleString() : '—',
            r.run_by_name || '—',
          ])}
          empty="No runs posted yet."
        />
      </section>
    </>
  );
}

// ---------------------------------------------------------------------------
// Reports
// ---------------------------------------------------------------------------
function ReportsTab({ api }) {
  const [view, setView] = useState('register');
  return (
    <>
      <section className="panel">
        <div className="filter-bar">
          <Button type="button" size="sm" variant={view === 'register' ? 'primary' : 'outline'} onClick={() => setView('register')}>Register</Button>
          <Button type="button" size="sm" variant={view === 'nbv' ? 'primary' : 'outline'} onClick={() => setView('nbv')}>NBV Summary</Button>
          <Button type="button" size="sm" variant={view === 'expense' ? 'primary' : 'outline'} onClick={() => setView('expense')}>Monthly Expense</Button>
        </div>
      </section>
      {view === 'register' && <RegisterReport api={api} />}
      {view === 'nbv' && <NbvSummaryReport api={api} />}
      {view === 'expense' && <MonthlyExpenseReport api={api} />}
    </>
  );
}

function RegisterReport({ api }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/accounts/reports/register/').then((res) => setData(res.data)).catch(() => {}); }, [api]);
  return (
    <section className="panel">
      <div className="panel-heading"><div><h2>Depreciation Register</h2>
        {data && <p className="panel-subtitle">{data.count} assets · cost {money(data.totals.cost)} · accumulated {money(data.totals.accumulated)} · NBV {money(data.totals.nbv)}</p>}
      </div></div>
      <DataTable
        columns={['Miczon ID', 'Device', 'Department', 'Cost', 'Rate', 'Accumulated', 'Net Book Value']}
        rows={(data?.rows || []).map((r) => [
          r.miczon_id, r.name, r.department || '—', money(r.cost), pct(r.annual_rate), money(r.accumulated_depreciation), <strong>{money(r.net_book_value)}</strong>,
        ])}
        empty="No depreciable assets yet."
      />
    </section>
  );
}

function NbvSummaryReport({ api }) {
  const [groupBy, setGroupBy] = useState('department');
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/accounts/reports/nbv-summary/?group_by=${groupBy}`).then((res) => setData(res.data)).catch(() => {});
  }, [api, groupBy]);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div><h2>Net Book Value Summary</h2></div>
        <Select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
          <option value="department">By Department</option>
          <option value="category">By Category</option>
        </Select>
      </div>
      <DataTable
        columns={[groupBy === 'category' ? 'Category' : 'Department', 'Assets', 'Cost', 'Accumulated', 'Net Book Value']}
        rows={(data?.rows || []).map((r) => [r.group, r.count, money(r.cost), money(r.accumulated_depreciation), <strong>{money(r.net_book_value)}</strong>])}
        empty="No data."
      />
    </section>
  );
}

function MonthlyExpenseReport({ api }) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  useEffect(() => {
    api.get(`/accounts/reports/monthly-expense/?year=${year}`).then((res) => setData(res.data)).catch(() => {});
  }, [api, year]);
  const years = [];
  for (let y = now.getFullYear() + 1; y >= now.getFullYear() - 6; y--) years.push(y);
  return (
    <section className="panel">
      <div className="panel-heading">
        <div><h2>Monthly Depreciation Expense</h2>{data && <p className="panel-subtitle">Grand total {money(data.grand_total)}</p>}</div>
        <Select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </Select>
      </div>
      <DataTable
        columns={['Month', 'Depreciation Expense']}
        rows={(data?.rows || []).map((r) => [`${MONTHS[r.month - 1]} ${r.year}`, <strong>{money(r.total)}</strong>])}
        empty="No posted depreciation for this year."
      />
    </section>
  );
}

// ---------------------------------------------------------------------------
// Disposals
// ---------------------------------------------------------------------------
function DisposalsTab({ api }) {
  const [disposals, setDisposals] = useState([]);
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    api.get('/accounts/disposals/').then((res) => setDisposals(normalizeList(res.data))).catch(() => setNotice('Unable to load disposals.'));
  }, [api]);
  useEffect(() => { load(); }, [load]);

  return (
    <section className="panel">
      {notice && <Notice>{notice}</Notice>}
      <div className="panel-heading">
        <div><h2>Asset Disposals</h2><p className="panel-subtitle">Sale / scrap / write-off. Gain or loss is computed vs. net book value at disposal.</p></div>
        <Button type="button" variant="primary" onClick={() => setCreating(true)}>Record Disposal</Button>
      </div>
      <DataTable
        columns={['Miczon ID', 'Device', 'Date', 'Method', 'Proceeds', 'NBV at Disposal', 'Gain / Loss']}
        rows={disposals.map((d) => [
          d.miczon_id, d.asset_name, d.disposal_date, <StatusBadge status={d.method} />,
          money(d.proceeds), money(d.nbv_at_disposal),
          <strong style={{ color: Number(d.gain_loss) >= 0 ? '#166534' : '#b91c1c' }}>{money(d.gain_loss)}</strong>,
        ])}
        empty="No disposals recorded."
      />
      {creating && (
        <DisposalEditor api={api} onClose={() => setCreating(false)} onSaved={() => { setCreating(false); load(); }} />
      )}
    </section>
  );
}

function DisposalEditor({ api, onClose, onSaved }) {
  const [financials, setFinancials] = useState([]);
  const [form, setForm] = useState({ asset_financial: '', disposal_date: new Date().toISOString().slice(0, 10), method: 'SOLD', proceeds: '0', notes: '' });
  const [error, setError] = useState('');

  useEffect(() => {
    fetchAll(api, '/accounts/asset-financials/').then((rows) => {
      setFinancials(rows.filter((f) => !f.is_disposed));
    }).catch(() => {});
  }, [api]);

  const selected = financials.find((f) => String(f.id) === String(form.asset_financial));

  const submit = async (e) => {
    e.preventDefault();
    if (!form.asset_financial) { setError('Choose an asset.'); return; }
    try {
      await api.post('/accounts/disposals/', {
        asset_financial: form.asset_financial,
        disposal_date: form.disposal_date,
        method: form.method,
        proceeds: form.proceeds === '' ? '0' : form.proceeds,
        notes: form.notes,
      });
      onSaved();
    } catch (err) {
      setError(apiError(err, 'Unable to record disposal.'));
    }
  };

  return (
    <Dialog open>
      <DialogContent>
        <DialogHeader title="Record Disposal" description="Gain/loss = proceeds − current net book value." />
        <form className="dialog-form" onSubmit={submit}>
          {error && <Notice tone="error">{error}</Notice>}
          <Field label="Asset">
            <Select value={form.asset_financial} onChange={(e) => setForm({ ...form, asset_financial: e.target.value })} required>
              <option value="">Select an asset...</option>
              {financials.map((f) => <option key={f.id} value={f.id}>{f.miczon_id} — {f.asset_name} (NBV {money(f.current_nbv)})</option>)}
            </Select>
          </Field>
          {selected && <p className="panel-subtitle">Current NBV: <strong>{money(selected.current_nbv)}</strong></p>}
          <Field label="Disposal date">
            <input type="date" required value={form.disposal_date} onChange={(e) => setForm({ ...form, disposal_date: e.target.value })} />
          </Field>
          <Field label="Method">
            <Select value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
              <option value="SOLD">Sold</option>
              <option value="SCRAPPED">Scrapped</option>
              <option value="LOST">Lost</option>
              <option value="WRITTEN_OFF">Written Off</option>
            </Select>
          </Field>
          <Field label="Proceeds (PKR)">
            <input type="number" min="0" step="0.01" value={form.proceeds} onChange={(e) => setForm({ ...form, proceeds: e.target.value })} />
          </Field>
          <Field label="Notes"><textarea rows="2" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <div className="dialog-footer">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="primary">Record</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
