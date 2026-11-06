import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { normalizeList, apiError } from '../lib/api';
import {
  Button, Select, Dialog, DialogContent, DialogHeader, PageHeader,
  Field, Notice, DataTable, Icon,
} from '../components/ui';

const money = (n) =>
  n === null || n === undefined || n === '' ? '—' : `Rs ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
const MONTHS = ['', 'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const CURRENT_YEAR = new Date().getFullYear();

const PERIOD_OPTIONS = [
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'last_6_months', label: 'Last 6 months' },
  { value: 'this_year', label: 'This year' },
  { value: 'all', label: 'All time' },
  { value: 'custom', label: 'Custom range' },
];

// Resolve a period selection into { from, to } ISO dates (local), '' = open end.
function monthRange(period, customFrom, customTo) {
  const now = new Date();
  const iso = (d) => { const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 10); };
  const y = now.getFullYear();
  const m = now.getMonth();
  if (period === 'custom') return { from: customFrom || '', to: customTo || '' };
  if (period === 'this_month') return { from: iso(new Date(y, m, 1)), to: iso(new Date(y, m + 1, 0)) };
  if (period === 'last_month') return { from: iso(new Date(y, m - 1, 1)), to: iso(new Date(y, m, 0)) };
  if (period === 'last_6_months') return { from: iso(new Date(y, m - 5, 1)), to: iso(now) };
  if (period === 'this_year') return { from: `${y}-01-01`, to: iso(now) };
  return { from: '', to: '' }; // all
}

export function BudgetsPage({ api }) {
  const [access, setAccess] = useState(null);
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('budgets:tab') || ''; } catch { return ''; } });

  useEffect(() => {
    api.get('/budgets/my-access/').then((r) => setAccess(r.data)).catch(() => setAccess({}));
  }, [api]);

  const tabs = useMemo(() => {
    if (!access) return [];
    const t = [];
    if (access.is_admin || access.is_approver || access.is_custodian) t.push({ key: 'dashboard', label: 'Dashboard' });
    if (access.department || access.is_admin) t.push({ key: 'mybudget', label: 'My Budget' });
    if (access.is_admin || access.is_approver || access.is_manager || access.approvals_count) {
      t.push({ key: 'approvals', label: `Approvals${access.approvals_count ? ` (${access.approvals_count})` : ''}` });
    }
    if (access.is_admin) t.push({ key: 'setup', label: 'Setup' });
    return t;
  }, [access]);

  const activeTab = tabs.find((t) => t.key === tab) ? tab : (tabs[0]?.key || '');
  const selectTab = (key) => { setTab(key); try { sessionStorage.setItem('budgets:tab', key); } catch { /* ignore */ } };

  if (!access) return <div style={{ padding: '24px', color: '#64748b' }}>Loading…</div>;

  return (
    <>
      <PageHeader eyebrow="Budgets & Expenses" title="Budgets">
        <div className="tab-bar" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {tabs.map((t) => (
            <Button key={t.key} type="button" size="sm" variant={activeTab === t.key ? 'primary' : 'outline'} onClick={() => selectTab(t.key)}>{t.label}</Button>
          ))}
        </div>
      </PageHeader>

      {tabs.length === 0 && <Notice tone="error">You don't have access to any budget areas yet. Ask an admin to set you as a department custodian or an approver.</Notice>}
      {activeTab === 'dashboard' && <DashboardTab api={api} access={access} />}
      {activeTab === 'mybudget' && <MyBudgetTab api={api} access={access} />}
      {activeTab === 'approvals' && <ApprovalsTab api={api} access={access} />}
      {activeTab === 'setup' && <SetupTab api={api} />}
    </>
  );
}

function Stat({ label, value, accent }) {
  return (
    <div style={{ flex: '1 1 150px', minWidth: '150px', border: '1px solid #e2e8f0', borderRadius: '10px', padding: '14px 16px', background: '#fff' }}>
      <div style={{ fontSize: '12px', color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.03em', fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: '22px', fontWeight: 700, color: accent || '#0f172a', marginTop: '4px' }}>{value}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dashboard — permission-scoped budget + claim roll-up, fiscal-year-to-date.
// Budget / Expense toggle + department dropdown ("All" for a cross-dept total).
// ---------------------------------------------------------------------------
const num = (v) => Number(v || 0);

const CardsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
    <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
  </svg>
);
const ListIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const TONES = ['blue', 'green', 'violet', 'amber', 'red', 'slate'];
const BIG = { fontSize: '26px' };
const SUB = { fontSize: '12px', fontWeight: 600, color: '#64748b' };

// A colored tile matching the Categories Overview cards (.metric-card). Renders
// as a button when onClick is given (drill into a department), else a plain tile.
function TileCard({ label, subtext, tone = 'slate', value, onClick }) {
  const inner = (
    <section className={`metric-card ${tone}`} style={{ height: '100%' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span>{label}</span>
        {subtext && <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#64748b' }}>{subtext}</span>}
      </div>
      {value}
    </section>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className="metric-card-link" style={{ display: 'block', width: '100%', textAlign: 'left', border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', font: 'inherit' }}>
        {inner}
      </button>
    );
  }
  return <div style={{ minWidth: 0 }}>{inner}</div>;
}

function budgetValue(alloc, spent, remaining) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <strong style={BIG}>{money(alloc)}</strong>
      <span style={SUB}>{money(spent)} spent · {money(remaining)} left</span>
    </div>
  );
}

function claimValue(total, approved, pending, rejected) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
      <strong style={BIG}>{money(total)}</strong>
      <span style={SUB}>{approved} approved · {pending} pending · {rejected} rejected</span>
    </div>
  );
}

function DashboardTab({ api, access }) {
  const [data, setData] = useState(null);
  const [view, setView] = useState('budget'); // 'budget' | 'expense'
  const [dept, setDept] = useState('all');     // 'all' | department id (string)
  const [cardView, setCardView] = useState(true); // cards by default, list on toggle
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api.get('/budgets/dashboard/')
      .then((r) => setData(r.data))
      .catch(() => setNotice('Unable to load the dashboard.'));
  }, [api]);

  const departments = data?.departments || [];
  const budgetLines = data?.budget_lines || [];
  const claimRows = data?.claim_rows || [];
  const isAll = dept === 'all';
  const deptId = isAll ? null : Number(dept);

  // Budget: summary + breakdown for the current selection
  const linesInScope = isAll ? budgetLines : budgetLines.filter((l) => l.department_id === deptId);
  const budgetTotals = linesInScope.reduce((a, l) => ({
    allocated: a.allocated + num(l.allocated),
    spent: a.spent + num(l.spent),
    remaining: a.remaining + num(l.remaining),
  }), { allocated: 0, spent: 0, remaining: 0 });

  // When "All" is picked, roll budget lines up per department; otherwise show
  // each category line within the chosen department.
  const budgetBreakdown = isAll
    ? Object.values(linesInScope.reduce((map, l) => {
        const k = l.department_id;
        if (!map[k]) map[k] = { key: k, name: l.department_name, sub: 'Department', allocated: 0, spent: 0, remaining: 0 };
        map[k].allocated += num(l.allocated); map[k].spent += num(l.spent); map[k].remaining += num(l.remaining);
        return map;
      }, {}))
    : linesInScope.map((l) => ({ key: l.budget_id, name: l.category, sub: l.department_name, allocated: num(l.allocated), spent: num(l.spent), remaining: num(l.remaining) }));

  // Expense claims: summary + breakdown
  const rowsInScope = isAll ? claimRows : claimRows.filter((r) => r.department_id === deptId);
  const claimTotals = rowsInScope.reduce((a, r) => ({
    total: a.total + num(r.total), total_count: a.total_count + r.total_count,
    approved: a.approved + num(r.approved), approved_count: a.approved_count + r.approved_count,
    pending: a.pending + num(r.pending), pending_count: a.pending_count + r.pending_count,
    rejected: a.rejected + num(r.rejected), rejected_count: a.rejected_count + r.rejected_count,
  }), { total: 0, total_count: 0, approved: 0, approved_count: 0, pending: 0, pending_count: 0, rejected: 0, rejected_count: 0 });

  if (!data && !notice) return <div style={{ padding: '24px', color: '#64748b' }}>Loading…</div>;

  const scopeName = isAll ? 'All departments' : (departments.find((d) => d.id === deptId)?.name || '');

  return (
    <div>
      {notice && <Notice tone="error">{notice}</Notice>}

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button type="button" size="sm" variant={view === 'budget' ? 'primary' : 'outline'} onClick={() => setView('budget')}>Budget</Button>
          <Button type="button" size="sm" variant={view === 'expense' ? 'primary' : 'outline'} onClick={() => setView('expense')}>Expense</Button>
        </div>
        <div>
          <Select size="sm" value={dept} onChange={(e) => setDept(e.target.value)} style={{ width: '200px' }}>
            <option value="all">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </div>
        <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
          <Button type="button" size="sm" variant={cardView ? 'primary' : 'outline'} onClick={() => setCardView(true)} aria-label="Card view" title="Card view"><CardsIcon /></Button>
          <Button type="button" size="sm" variant={!cardView ? 'primary' : 'outline'} onClick={() => setCardView(false)} aria-label="List view" title="List view"><ListIcon /></Button>
        </div>
      </div>
      <p style={{ fontSize: '12.5px', color: '#64748b', margin: '0 0 14px' }}>
        {view === 'budget' ? 'Budget' : 'Expense Tickets'} · {scopeName} · fiscal year to date
      </p>

      {view === 'budget' ? (
        cardView ? (
          <div className="metric-grid">
            <TileCard
              label={isAll ? 'All Departments' : scopeName}
              subtext={isAll ? 'Org-wide total' : 'All categories'}
              tone="slate"
              value={budgetValue(budgetTotals.allocated, budgetTotals.spent, budgetTotals.remaining)}
            />
            {budgetBreakdown.map((b, i) => (
              <TileCard
                key={b.key}
                label={b.name}
                subtext={isAll ? 'Click to open' : b.sub}
                tone={TONES[i % TONES.length]}
                value={budgetValue(b.allocated, b.spent, b.remaining)}
                onClick={isAll ? () => setDept(String(b.key)) : undefined}
              />
            ))}
          </div>
        ) : (
          <DataTable
            columns={[isAll ? 'Department' : 'Category', 'Budget', 'Spent', 'Remaining']}
            rows={[
              ['Total', money(budgetTotals.allocated), money(budgetTotals.spent), money(budgetTotals.remaining)],
              ...budgetBreakdown.map((b) => [b.name, money(b.allocated), money(b.spent), money(b.remaining)]),
            ]}
            empty="No budgets to show for this selection."
          />
        )
      ) : (
        cardView ? (
          <div className="metric-grid">
            <TileCard
              label={isAll ? 'All Departments' : scopeName}
              subtext={`${claimTotals.total_count} ticket(s)`}
              tone="slate"
              value={claimValue(claimTotals.total, claimTotals.approved_count, claimTotals.pending_count, claimTotals.rejected_count)}
            />
            {isAll && rowsInScope.map((r, i) => (
              <TileCard
                key={r.department_id}
                label={r.department_name}
                subtext="Click to open"
                tone={TONES[i % TONES.length]}
                value={claimValue(r.total, r.approved_count, r.pending_count, r.rejected_count)}
                onClick={() => setDept(String(r.department_id))}
              />
            ))}
          </div>
        ) : (
          <DataTable
            columns={['Department', 'Total', 'Approved', 'Pending', 'Rejected', 'Claims']}
            rows={[
              ['Total', money(claimTotals.total), money(claimTotals.approved), money(claimTotals.pending), money(claimTotals.rejected), claimTotals.total_count],
              ...rowsInScope.map((r) => [r.department_name, money(r.total), money(r.approved), money(r.pending), money(r.rejected), r.total_count]),
            ]}
            empty="No Expense Tickets to show."
          />
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// My Budget — apply, see balance, log expenses + bills, close month
// ---------------------------------------------------------------------------
function MyBudgetTab({ api }) {
  const [budgets, setBudgets] = useState([]);
  const [budgetId, setBudgetId] = useState('');
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [notice, setNotice] = useState('');
  const [reqDialog, setReqDialog] = useState(null);
  const [expDialog, setExpDialog] = useState(null);
  const [openingDialog, setOpeningDialog] = useState(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    api.get('/budgets/department-budgets/mine/').then((r) => {
      const list = normalizeList(r.data);
      setBudgets(list);
      setBudgetId((cur) => (cur && list.some((b) => String(b.id) === cur)) ? cur : (list[0] ? String(list[0].id) : ''));
    }).catch(() => setNotice('Unable to load your budgets.'));
  }, [api]);

  const load = useCallback(() => {
    if (!budgetId) { setSummary(null); setExpenses([]); setMyRequests([]); return; }
    api.get(`/budgets/cycles/summary/?budget=${budgetId}`).then((r) => {
      setSummary(r.data);
      const cycleId = r.data?.cycle?.id;
      if (cycleId) {
        api.get(`/budgets/expenses/?cycle=${cycleId}`).then((er) => setExpenses(normalizeList(er.data))).catch(() => {});
        api.get(`/budgets/advance-requests/?scope=mine&cycle=${cycleId}`).then((rr) => setMyRequests(normalizeList(rr.data))).catch(() => {});
      } else { setExpenses([]); setMyRequests([]); }
    }).catch(() => setNotice('Unable to load this budget.'));
  }, [api, budgetId]);

  useEffect(() => { load(); }, [load]);

  const bal = summary?.balance || {};
  const cycle = summary?.cycle;
  const closed = cycle?.status === 'CLOSED';
  const monthlyBudget = summary?.monthly_budget != null ? Number(summary.monthly_budget) : null;
  const budgetThisMonth = Number(bal.opening_balance || 0) + Number(bal.received || 0);
  // Default top-up = the gap between the fixed monthly budget and what's left,
  // so one approval brings the department back up to its full budget.
  const topUpDefault = monthlyBudget != null ? Math.max(0, monthlyBudget - Number(bal.available || 0)) : '';

  const submitRequest = async () => {
    setWorking(true);
    try {
      const r = await api.post('/budgets/advance-requests/', { budget: budgetId, amount: reqDialog.amount || 0, reason: reqDialog.reason || '' });
      setReqDialog(null);
      const stage = r.data?.next_with;
      setNotice(stage ? `Budget Ticket submitted — now with ${stage}.` : 'Budget Ticket submitted.');
      load();
    } catch (err) { setNotice(apiError(err, 'Unable to submit Budget Ticket.')); } finally { setWorking(false); }
  };

  const submitExpense = async () => {
    setWorking(true);
    try {
      const fd = new FormData();
      fd.append('budget', budgetId);
      if (cycle?.id) fd.append('cycle', cycle.id);
      fd.append('title', expDialog.title || '');
      fd.append('amount', expDialog.amount || 0);
      if (expDialog.spent_on) fd.append('spent_on', expDialog.spent_on);
      if (expDialog.note) fd.append('note', expDialog.note);
      if (expDialog.file) fd.append('bill', expDialog.file);
      await api.post('/budgets/expenses/', fd);
      setExpDialog(null); setNotice('Expense added.'); load();
    } catch (err) { setNotice(apiError(err, 'Unable to add expense.')); } finally { setWorking(false); }
  };

  const deleteExpense = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    try { await api.delete(`/budgets/expenses/${id}/`); load(); } catch (err) { setNotice(apiError(err, 'Unable to delete.')); }
  };

  const cancelRequest = async (id) => {
    if (!window.confirm('Cancel this Budget Ticket?')) return;
    try { await api.post(`/budgets/advance-requests/${id}/cancel/`); load(); } catch (err) { setNotice(apiError(err, 'Unable to cancel.')); }
  };

  const closeMonth = async () => {
    if (!cycle?.id) return;
    if (!window.confirm('Close this month? Any remaining balance carries into next month and this month becomes read-only.')) return;
    try { await api.post(`/budgets/cycles/${cycle.id}/close/`); setNotice('Month closed — balance carried forward.'); load(); }
    catch (err) { setNotice(apiError(err, 'Unable to close month.')); }
  };

  const saveOpening = async () => {
    setWorking(true);
    try {
      await api.post(`/budgets/cycles/${cycle.id}/set-opening/`, { amount: openingDialog.amount || 0 });
      setOpeningDialog(null); setNotice('Carried-over balance updated.'); load();
    } catch (err) { setNotice(apiError(err, 'Unable to update balance.')); } finally { setWorking(false); }
  };

  return (
    <div>
      {notice && <Notice tone={notice.includes('Unable') ? 'error' : 'success'}>{notice}</Notice>}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {budgets.length > 0 && (
            <Select size="sm" value={budgetId} onChange={(e) => setBudgetId(e.target.value)} style={{ width: '260px' }}>
              {budgets.map((b) => <option key={b.id} value={b.id}>{b.department_name} · {b.name}</option>)}
            </Select>
          )}
          {cycle && <span style={{ color: '#64748b', fontSize: '14px' }}>{MONTHS[cycle.month]} {cycle.year}{closed ? ' · closed' : ''}</span>}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button type="button" size="sm" disabled={!budgetId} onClick={() => setReqDialog({ amount: topUpDefault, reason: '' })}>New Budget Ticket</Button>
          {cycle && !closed && <Button type="button" size="sm" variant="outline" onClick={closeMonth}>Close Month</Button>}
        </div>
      </div>

      {!budgetId ? (
        <div style={{ padding: '24px', color: '#64748b', fontSize: '14px', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>No budgets assigned to you yet. An admin can set one up under Setup.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', marginBottom: '6px' }}>
            <Stat label="Budget this month" value={money(budgetThisMonth)} accent="#0d9488" />
            <Stat label="Spent" value={money(bal.spent)} accent="#e11d48" />
            <Stat label="Remaining" value={money(bal.available)} accent="#2563eb" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', fontSize: '12.5px', color: '#64748b', margin: '0 0 18px' }}>
            <span>Budget this month = carried over <strong style={{ color: '#334155' }}>{money(bal.opening_balance)}</strong> + approved <strong style={{ color: '#334155' }}>{money(bal.received)}</strong>.</span>
            {monthlyBudget != null && <span>Monthly allocation: {money(monthlyBudget)}.</span>}
            {!closed && (
              <button type="button" onClick={() => setOpeningDialog({ amount: bal.opening_balance })} style={{ background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '12.5px', padding: 0 }}>Edit carried-over</button>
            )}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 8px' }}>
            <h3 style={{ margin: 0, fontSize: '15px' }}>Expenses</h3>
            <Button type="button" size="sm" disabled={!cycle || closed} onClick={() => setExpDialog({ title: '', amount: '', spent_on: '', note: '', file: null })}>Add Expense</Button>
          </div>
          <DataTable
            columns={['Date', 'Title', 'Amount', 'Bill', '']}
            rows={expenses.map((e) => [
              e.spent_on || '—', e.title, money(e.amount),
              (e.bills || []).length
                ? (e.bills || []).map((b, i) => <a key={b.id} href={b.file_url} target="_blank" rel="noreferrer" style={{ marginRight: '6px', color: '#2563eb' }}>bill{i + 1}</a>)
                : '—',
              !closed ? <Button type="button" variant="ghost" size="sm" onClick={() => deleteExpense(e.id)}><Icon name="trash" /></Button> : '',
            ])}
            empty="No expenses logged this month yet."
          />

          <div style={{ margin: '22px 0 8px' }}>
            <h3 style={{ margin: 0, fontSize: '15px' }}>This month's Budget Tickets</h3>
            <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#64748b' }}>Each approved ticket adds to this month's budget. Submit another anytime you need more.</p>
          </div>
          <DataTable
            columns={['Ticket #', 'Amount', 'Status', '']}
            rows={myRequests.map((r) => [
              `#${r.id}`, money(r.amount), r.status_label,
              ['DRAFT', 'PENDING', 'PENDING_FINANCE', 'PENDING_CEO'].includes(r.status)
                ? <Button type="button" variant="ghost" size="sm" onClick={() => cancelRequest(r.id)}>Cancel</Button>
                : '',
            ])}
            empty="No Budget Tickets this month yet. Use 'New Budget Ticket' above."
          />
        </>
      )}

      <Dialog open={!!reqDialog}>
        {reqDialog && (
          <DialogContent className="dialog-sm">
            <DialogHeader title="New Budget Ticket" onClose={() => setReqDialog(null)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Field label="Amount (Rs)"><input type="number" step="0.01" value={reqDialog.amount} onChange={(e) => setReqDialog({ ...reqDialog, amount: e.target.value })} /></Field>
              {monthlyBudget != null && (
                <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>
                  Your monthly budget is {money(monthlyBudget)} and you have {money(bal.available)} left, so this tops you up by {money(topUpDefault)} to reach {money(monthlyBudget)}. Edit the amount if you need more.
                </p>
              )}
              <Field label="Reason"><textarea rows={3} value={reqDialog.reason} onChange={(e) => setReqDialog({ ...reqDialog, reason: e.target.value })} placeholder="What is this budget for?" /></Field>
              <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>This goes through your department's approval pipeline. You'll be emailed when it's approved.</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <Button type="button" variant="outline" onClick={() => setReqDialog(null)}>Cancel</Button>
                <Button type="button" onClick={submitRequest} disabled={working || !(Number(reqDialog.amount) > 0)}>{working ? 'Submitting…' : 'Submit'}</Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={!!expDialog}>
        {expDialog && (
          <DialogContent className="dialog-sm">
            <DialogHeader title="Add Expense" onClose={() => setExpDialog(null)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Field label="Title"><input value={expDialog.title} onChange={(e) => setExpDialog({ ...expDialog, title: e.target.value })} placeholder="What did you spend on?" /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Field label="Amount (Rs)"><input type="number" step="0.01" value={expDialog.amount} onChange={(e) => setExpDialog({ ...expDialog, amount: e.target.value })} /></Field>
                <Field label="Date"><input type="date" value={expDialog.spent_on} onChange={(e) => setExpDialog({ ...expDialog, spent_on: e.target.value })} /></Field>
              </div>
              <Field label="Note (optional)"><input value={expDialog.note} onChange={(e) => setExpDialog({ ...expDialog, note: e.target.value })} /></Field>
              <Field label="Bill / receipt (optional)"><input type="file" onChange={(e) => setExpDialog({ ...expDialog, file: e.target.files?.[0] || null })} /></Field>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <Button type="button" variant="outline" onClick={() => setExpDialog(null)}>Cancel</Button>
                <Button type="button" onClick={submitExpense} disabled={working || !expDialog.title.trim() || !(Number(expDialog.amount) > 0)}>{working ? 'Saving…' : 'Save'}</Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={!!openingDialog}>
        {openingDialog && (
          <DialogContent className="dialog-sm">
            <DialogHeader title="Carried-over balance" onClose={() => setOpeningDialog(null)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <p style={{ fontSize: '13px', color: '#475569', margin: 0 }}>This is last month's remaining balance, carried into {cycle ? `${MONTHS[cycle.month]} ${cycle.year}` : 'this month'}. Adjust it if you need to.</p>
              <Field label="Opening balance (Rs)"><input type="number" step="0.01" value={openingDialog.amount} onChange={(e) => setOpeningDialog({ ...openingDialog, amount: e.target.value })} /></Field>
              {summary?.prev_available != null && String(summary.prev_available) !== String(openingDialog.amount) && (
                <button type="button" onClick={() => setOpeningDialog({ ...openingDialog, amount: summary.prev_available })} style={{ alignSelf: 'flex-start', background: 'none', border: 'none', color: '#2563eb', cursor: 'pointer', fontSize: '12.5px', padding: 0 }}>
                  Use last month's remaining ({money(summary.prev_available)})
                </button>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <Button type="button" variant="outline" onClick={() => setOpeningDialog(null)}>Cancel</Button>
                <Button type="button" onClick={saveOpening} disabled={working}>{working ? 'Saving…' : 'Save'}</Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Approvals — Finance then CEO
// ---------------------------------------------------------------------------
function ApprovalCard({ tag, title, sub, reason, history, onApprove, onReject }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', marginBottom: '12px', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <span style={{ fontSize: '11px', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{tag}</span>
          <div style={{ fontWeight: 700, marginTop: '2px' }}>{title}</div>
          <div style={{ fontSize: '13px', color: '#475569', marginTop: '2px' }}>{sub}</div>
          {reason && <div style={{ fontSize: '13px', color: '#334155', marginTop: '6px' }}>{reason}</div>}
          {(history || []).length > 0 && (
            <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
              {history.map((h) => `${h.stage}: ${h.status.toLowerCase()}${h.note ? ` (${h.note})` : ''}`).join('  ·  ')}
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
          <Button type="button" size="sm" onClick={onApprove}>Approve</Button>
          <Button type="button" size="sm" variant="outline" onClick={onReject}>Reject</Button>
        </div>
      </div>
    </div>
  );
}

// A pill-style segmented control. options: [{ value, label, count? }].
function Segmented({ options, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: '999px', padding: '3px' }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            style={{ cursor: 'pointer', border: 'none', background: on ? '#fff' : 'transparent', color: on ? '#0f766e' : '#64748b', fontWeight: 600, fontSize: '13px', padding: '6px 16px', borderRadius: '999px', boxShadow: on ? '0 1px 2px rgba(15,23,42,0.12)' : 'none', transition: 'color .15s, background .15s', display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            {o.label}
            {o.count != null && o.count !== '' && (
              <span style={{ fontSize: '11px', fontWeight: 700, minWidth: '16px', textAlign: 'center', padding: '0 5px', borderRadius: '999px', background: on ? '#0f766e' : '#e2e8f0', color: on ? '#fff' : '#64748b' }}>{o.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ApprovalsTab({ api, access }) {
  const [view, setView] = useState('inbox'); // 'inbox' | 'history'
  const [kind, setKind] = useState('budget'); // history: 'budget' | 'expense'
  const [reqs, setReqs] = useState([]);
  const [claims, setClaims] = useState([]);
  const [hReqs, setHReqs] = useState([]);
  const [hClaims, setHClaims] = useState([]);
  const [hLoading, setHLoading] = useState(false);
  const [period, setPeriod] = useState('this_month');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null); // { type, item, approve, note }
  const [working, setWorking] = useState(false);
  const canHistory = !!(access?.is_approver || access?.is_admin);

  const load = useCallback(() => {
    api.get('/budgets/advance-requests/?scope=approvals').then((r) => setReqs(normalizeList(r.data))).catch(() => setNotice('Unable to load approvals.'));
    api.get('/budgets/expense-claims/?scope=approvals').then((r) => setClaims(normalizeList(r.data))).catch(() => {});
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const loadHistory = useCallback(() => {
    setHLoading(true);
    const { from, to } = monthRange(period, customFrom, customTo);
    const q = new URLSearchParams({ scope: 'history' });
    if (from) q.set('from', from);
    if (to) q.set('to', to);
    Promise.allSettled([
      api.get(`/budgets/advance-requests/?${q.toString()}`),
      api.get(`/budgets/expense-claims/?${q.toString()}`),
    ]).then(([r, c]) => {
      if (r.status === 'fulfilled') setHReqs(normalizeList(r.value.data));
      if (c.status === 'fulfilled') setHClaims(normalizeList(c.value.data));
    }).finally(() => setHLoading(false));
  }, [api, period, customFrom, customTo]);
  useEffect(() => { if (canHistory) loadHistory(); }, [canHistory, loadHistory]);

  const act = async () => {
    setWorking(true);
    try {
      const { type, item, approve, note } = dialog;
      const base = type === 'claim' ? 'expense-claims' : 'advance-requests';
      await api.post(`/budgets/${base}/${item.id}/${approve ? 'approve' : 'reject'}/`, { note: note || '' });
      setDialog(null); setNotice(approve ? 'Approved.' : 'Rejected.'); load(); loadHistory();
    } catch (err) { setNotice(apiError(err, 'Unable to update.')); } finally { setWorking(false); }
  };

  const empty = reqs.length === 0 && claims.length === 0;

  const bar = canHistory && (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', flexWrap: 'wrap' }}>
      <Segmented
        value={view}
        onChange={setView}
        options={[
          { value: 'inbox', label: 'Pending', count: reqs.length + claims.length || '' },
          { value: 'history', label: 'History' },
        ]}
      />
      {view === 'history' && (
        <>
          <span style={{ width: '1px', height: '24px', background: '#e2e8f0' }} />
          <Segmented
            value={kind}
            onChange={setKind}
            options={[
              { value: 'budget', label: 'Budget', count: hReqs.length || '' },
              { value: 'expense', label: 'Expense', count: hClaims.length || '' },
            ]}
          />
          <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <Select size="sm" value={period} onChange={(e) => setPeriod(e.target.value)}>
              {PERIOD_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Select>
            {period === 'custom' && (
              <>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }} />
                <span style={{ color: '#94a3b8', fontSize: '13px' }}>to</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ padding: '6px 8px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '13px' }} />
              </>
            )}
          </div>
        </>
      )}
    </div>
  );

  if (view === 'history') {
    const list = kind === 'budget' ? hReqs : hClaims;
    const periodLabel = (PERIOD_OPTIONS.find((o) => o.value === period)?.label || '').toLowerCase();
    return (
      <div>
        {bar}
        <p style={{ fontSize: '12.5px', color: '#64748b', margin: '0 0 14px' }}>
          {access?.is_admin ? 'Every Budget Ticket and Expense Ticket — all statuses, all departments.' : 'Budget and Expense Tickets you have approved, with their current status.'} Showing {periodLabel}.
        </p>
        {hLoading ? (
          <div style={{ padding: '24px', color: '#64748b' }}>Loading…</div>
        ) : list.length === 0 ? (
          <div style={{ padding: '24px', color: '#64748b', fontSize: '14px', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>
            {kind === 'budget' ? 'No Budget Tickets' : 'No Expense Tickets'} for {periodLabel}.
          </div>
        ) : kind === 'budget' ? (
          hReqs.map((req) => (
            <HistoryCard
              key={`r${req.id}`}
              title={`Ticket #${req.id} · ${req.department_name}${req.budget_name ? ` · ${req.budget_name}` : ''} · ${money(req.amount)}`}
              sub={req.next_with ? `Waiting on ${req.next_with}` : ''}
              reason={req.reason}
              status={req.status}
              statusLabel={req.status_label}
              requester={req.requested_by_name}
              createdAt={req.created_at}
              history={req.history}
            />
          ))
        ) : (
          hClaims.map((c) => (
            <HistoryCard
              key={`c${c.id}`}
              title={`Ticket #${c.id} · ${c.claim_type_name || 'Expense Ticket'} · ${money(c.amount)}`}
              sub={`${c.department_name || '—'} · ${c.kind_label}${c.next_with ? ` · waiting on ${c.next_with}` : ''}`}
              reason={c.reason}
              status={c.status}
              statusLabel={c.status_label}
              requester={c.claimant_name}
              createdAt={c.created_at}
              history={c.history}
            />
          ))
        )}
      </div>
    );
  }

  return (
    <div>
      {bar}
      {notice && <Notice tone={notice.includes('Unable') ? 'error' : 'success'}>{notice}</Notice>}
      {empty && (
        <div style={{ padding: '24px', color: '#64748b', fontSize: '14px', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>Nothing is waiting for your approval.</div>
      )}

      {reqs.map((req) => (
        <ApprovalCard
          key={`r${req.id}`}
          tag="Budget Ticket"
          title={`Ticket #${req.id} · ${req.department_name}${req.budget_name ? ` · ${req.budget_name}` : ''} · ${money(req.amount)}`}
          sub={`By ${req.requested_by_name || '—'} · waiting on ${req.next_with}`}
          reason={req.reason}
          history={req.history}
          onApprove={() => setDialog({ type: 'budget', item: req, approve: true, note: '' })}
          onReject={() => setDialog({ type: 'budget', item: req, approve: false, note: '' })}
        />
      ))}

      {claims.map((c) => (
        <ApprovalCard
          key={`c${c.id}`}
          tag="Expense Ticket"
          title={`Ticket #${c.id} · ${c.claim_type_name || 'Expense Ticket'} · ${money(c.amount)}`}
          sub={`By ${c.claimant_name || '—'} (${c.department_name || '—'}) · ${c.kind_label} · waiting on ${c.next_with}`}
          reason={c.reason}
          history={c.history}
          onApprove={() => setDialog({ type: 'claim', item: c, approve: true, note: '' })}
          onReject={() => setDialog({ type: 'claim', item: c, approve: false, note: '' })}
        />
      ))}

      <Dialog open={!!dialog}>
        {dialog && (
          <DialogContent className="dialog-sm">
            <DialogHeader title={`${dialog.approve ? 'Approve' : 'Reject'} Ticket #${dialog.item.id}`} onClose={() => setDialog(null)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Field label="Note (optional)"><textarea rows={3} value={dialog.note} onChange={(e) => setDialog({ ...dialog, note: e.target.value })} placeholder={dialog.approve ? 'Any note for the applicant' : 'Reason for rejection'} /></Field>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <Button type="button" variant="outline" onClick={() => setDialog(null)}>Cancel</Button>
                <Button type="button" onClick={act} disabled={working}>{working ? 'Saving…' : (dialog.approve ? 'Approve' : 'Reject')}</Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------------------
// History — a role-based approval track (what I approved), with a Budget /
// Expense toggle. Admins see every request and claim, all statuses.
// ---------------------------------------------------------------------------
const STATUS_TONE = {
  APPROVED: { bg: '#dcfce7', fg: '#166534' },
  REJECTED: { bg: '#fee2e2', fg: '#991b1b' },
  CANCELLED: { bg: '#f1f5f9', fg: '#475569' },
  DRAFT: { bg: '#f1f5f9', fg: '#475569' },
  PENDING: { bg: '#fef9c3', fg: '#854d0e' },
  PENDING_MANAGER: { bg: '#fef9c3', fg: '#854d0e' },
  PENDING_FINANCE: { bg: '#fef9c3', fg: '#854d0e' },
  PENDING_CEO: { bg: '#fef9c3', fg: '#854d0e' },
};

const fmtDate = (s) => {
  if (!s) return '';
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString();
};

function StatusChip({ status, label }) {
  const tone = STATUS_TONE[status] || { bg: '#f1f5f9', fg: '#475569' };
  return (
    <span style={{ fontSize: '11px', fontWeight: 700, padding: '3px 10px', borderRadius: '999px', background: tone.bg, color: tone.fg, whiteSpace: 'nowrap', height: 'fit-content' }}>
      {label || status}
    </span>
  );
}

function ApprovalTimeline({ requester, createdAt, history }) {
  // First node = who raised it, then one node per approval step.
  const nodes = [
    { key: 'req', dot: '#3b82f6', label: 'Requester', name: requester || '—', detail: `raised${createdAt ? ` · ${fmtDate(createdAt)}` : ''}` },
    ...(history || []).map((h, i) => {
      const st = String(h.status || '').toUpperCase();
      return {
        key: h.id || `h${i}`,
        dot: st === 'REJECTED' ? '#ef4444' : st === 'APPROVED' ? '#22c55e' : '#cbd5e1',
        label: h.stage && h.stage !== 'Approver' ? h.stage : `Step ${i + 1}`,
        name: h.approver_name || '—',
        detail: `${st.toLowerCase() || 'pending'}${h.acted_at ? ` · ${fmtDate(h.acted_at)}` : ''}`,
        note: st === 'REJECTED' ? h.note : '',
      };
    }),
  ];
  return (
    <div style={{ marginTop: '14px', display: 'flex', alignItems: 'flex-start', overflowX: 'auto', paddingBottom: '2px' }}>
      {nodes.map((n, i) => {
        const last = i === nodes.length - 1;
        return (
          <div key={n.key} style={{ flex: last ? '0 0 auto' : '1 1 0', minWidth: last ? 'auto' : '120px' }}>
            {/* dot + connector line to the next node */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ width: '20px', height: '20px', flexShrink: 0, borderRadius: '50%', background: n.dot, boxShadow: `0 0 0 4px ${n.dot}22` }} />
              {!last && <span style={{ flex: 1, height: '3px', background: '#e2e8f0', marginLeft: '6px' }} />}
            </div>
            {/* minimal labels beneath the dot */}
            <div style={{ paddingRight: '12px', marginTop: '8px' }}>
              <div style={{ fontSize: '12.5px', fontWeight: 700, color: '#1e293b' }}>{n.label}</div>
              <div style={{ fontSize: '12px', color: '#475569', marginTop: '1px' }}>{n.name}</div>
              <div style={{ fontSize: '11px', color: '#94a3b8' }}>{n.detail}</div>
              {n.note && <div style={{ fontSize: '11px', color: '#b91c1c', marginTop: '1px', fontStyle: 'italic' }}>“{n.note}”</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HistoryCard({ title, sub, reason, status, statusLabel, requester, createdAt, history }) {
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', marginBottom: '12px', background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 700 }}>{title}</div>
          {sub && <div style={{ fontSize: '13px', color: '#475569', marginTop: '2px' }}>{sub}</div>}
          {reason && <div style={{ fontSize: '13px', color: '#334155', marginTop: '6px' }}>{reason}</div>}
        </div>
        <StatusChip status={status} label={statusLabel} />
      </div>
      <ApprovalTimeline requester={requester} createdAt={createdAt} history={history} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Approval pipeline editor — an ordered, editable chain of stages. Budget
// pipelines are scoped per department, claim pipelines per claim type, each
// with a Default used when a scope has none.
// ---------------------------------------------------------------------------
function PeoplePicker({ employees, selected, onToggle }) {
  const [q, setQ] = useState('');
  const list = employees.filter((e) => (e.name || '').toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <div style={{ border: '1px solid #e2e8f0', borderRadius: '6px', padding: '6px' }}>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search employee…"
        style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px', border: '1px solid #cbd5e1', borderRadius: '5px', fontSize: '13px', marginBottom: '4px' }} />
      <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
        {list.length === 0 ? <span style={{ fontSize: '13px', color: '#64748b' }}>No employees found.</span>
          : list.map((e) => (
            <label key={e.id} style={{ display: 'flex', gap: '6px', alignItems: 'center', fontSize: '13px', padding: '2px 0' }}>
              <input type="checkbox" checked={selected.includes(e.id)} onChange={() => onToggle(e.id)} />{e.name}
            </label>
          ))}
      </div>
    </div>
  );
}

const APPROVER_TYPES = [
  { kind: 'ROLE', title: 'A role', hint: 'Anyone holding a role you defined (e.g. Finance, CEO).' },
  { kind: 'PERSON', title: 'Specific people', hint: 'Pick one or more people — any one of them can approve.' },
  { kind: 'DEPT_MANAGER', title: "The department's manager", hint: "Resolved automatically. Skipped if the applicant is the manager." },
];

function stepSummary(s, roles) {
  if (s.label) return s.label;
  if (s.approver_kind === 'ROLE') return (roles.find((r) => r.id === Number(s.role))?.name) || 'Role';
  if (s.approver_kind === 'PERSON') return `${s.people.length} ${s.people.length === 1 ? 'person' : 'people'}`;
  return 'Department Manager';
}

// Step-by-step wizard: name the pipeline, then add one approver at a time with
// a live preview of the chain. Used for both creating and editing a pipeline.
function PipelineWizard({ api, roles, employees, initial, onClose, onSaved }) {
  const emptyDraft = useCallback(() => ({ approver_kind: 'ROLE', role: roles[0]?.id ?? '', people: [], label: '' }), [roles]);

  const [phase, setPhase] = useState('name'); // 'name' | 'build'
  const [name, setName] = useState(initial?.name || '');
  const [steps, setSteps] = useState(() => (initial?.stages || []).map((s) => ({
    approver_kind: s.approver_kind, role: s.role || (roles[0]?.id ?? ''), people: s.people || [], label: s.label || '',
  })));
  const [draft, setDraft] = useState(emptyDraft);
  const [adding, setAdding] = useState(!(initial?.stages || []).length); // show the add-card up front
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  const draftValid = draft.approver_kind === 'ROLE' ? !!draft.role
    : draft.approver_kind === 'PERSON' ? draft.people.length > 0 : true;

  const commitDraft = () => {
    if (!draftValid) return;
    setSteps((cur) => [...cur, draft]);
    setDraft(emptyDraft());
    setAdding(false);
  };
  const removeStep = (i) => setSteps((cur) => cur.filter((_, idx) => idx !== i));
  const moveStep = (i, dir) => setSteps((cur) => { const j = i + dir; if (j < 0 || j >= cur.length) return cur; const c = [...cur]; [c[i], c[j]] = [c[j], c[i]]; return c; });
  const togglePerson = (id) => setDraft((d) => ({ ...d, people: d.people.includes(id) ? d.people.filter((x) => x !== id) : [...d.people, id] }));

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      let id = initial?.id;
      if (id) await api.put(`/budgets/pipelines/${id}/`, { name: name.trim(), is_active: true });
      else { const r = await api.post('/budgets/pipelines/', { name: name.trim(), is_active: true }); id = r.data.id; }
      const payload = steps.map((s) => ({
        approver_kind: s.approver_kind,
        role: s.approver_kind === 'ROLE' ? Number(s.role) : null,
        people: s.approver_kind === 'PERSON' ? s.people : [],
        label: s.label,
      }));
      await api.post(`/budgets/pipelines/${id}/set-stages/`, { stages: payload });
      onSaved(); onClose();
    } catch (e) { setErr(apiError(e, 'Unable to save the pipeline.')); setSaving(false); }
  };

  const stepN = steps.length + 1;

  return (
    <Dialog open>
      <DialogContent className="dialog-sm">
        <DialogHeader title={initial ? 'Edit pipeline' : 'New pipeline'} onClose={onClose} />
        {err && <div style={{ marginBottom: '12px' }}><Notice tone="error">{err}</Notice></div>}

        {phase === 'name' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div style={{ fontSize: '13px', color: '#64748b' }}>Step 1 of 2 · Give this pipeline a name.</div>
            <Field label="Pipeline name">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Standard 2-step, High-value chain" autoFocus />
            </Field>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
              <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
              <Button type="button" onClick={() => setPhase('build')} disabled={!name.trim()}>Next →</Button>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div style={{ fontSize: '13px', color: '#64748b' }}>Step 2 of 2 · Add approvers in order. A ticket goes to each step in turn.</div>

            {/* live preview of the chain */}
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, color: '#334155', marginBottom: '6px' }}>Approval chain</div>
              {steps.length === 0 ? (
                <div style={{ fontSize: '13px', color: '#9a3412', background: '#fff7ed', border: '1px solid #fed7aa', borderRadius: '6px', padding: '8px 10px' }}>
                  No steps yet — add the first approver below.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {steps.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px 10px', background: '#f8fafc' }}>
                      <span style={{ width: '22px', height: '22px', flexShrink: 0, borderRadius: '50%', background: '#2563eb', color: '#fff', fontSize: '12px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
                      <span style={{ fontSize: '13.5px', fontWeight: 600 }}>{stepSummary(s, roles)}</span>
                      <span style={{ fontSize: '12px', color: '#94a3b8' }}>{APPROVER_TYPES.find((t) => t.kind === s.approver_kind)?.title}</span>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: '2px' }}>
                        <Button type="button" size="sm" variant="ghost" onClick={() => moveStep(i, -1)} disabled={i === 0}>↑</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1}>↓</Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => removeStep(i)}><Icon name="trash" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* add-a-step card */}
            {adding ? (
              <div style={{ border: '1px solid #cbd5e1', borderRadius: '10px', padding: '12px', background: '#fff' }}>
                <div style={{ fontSize: '13px', fontWeight: 700, marginBottom: '8px' }}>Who approves at step {stepN}?</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {APPROVER_TYPES.map((t) => {
                    const on = draft.approver_kind === t.kind;
                    return (
                      <button key={t.kind} type="button" onClick={() => setDraft({ ...draft, approver_kind: t.kind })}
                        style={{ textAlign: 'left', cursor: 'pointer', border: `1px solid ${on ? '#2563eb' : '#e2e8f0'}`, background: on ? '#eff6ff' : '#fff', borderRadius: '8px', padding: '8px 10px' }}>
                        <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#1e293b' }}>{t.title}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>{t.hint}</div>
                      </button>
                    );
                  })}
                </div>

                {draft.approver_kind === 'ROLE' && (
                  <div style={{ marginTop: '10px' }}>
                    {roles.length === 0 ? (
                      <div style={{ fontSize: '12.5px', color: '#9a3412' }}>No roles yet — add a role under “Approval roles” first.</div>
                    ) : (
                      <Field label="Which role?">
                        <Select value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })}>
                          <option value="">Select role…</option>
                          {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </Select>
                      </Field>
                    )}
                  </div>
                )}
                {draft.approver_kind === 'PERSON' && (
                  <div style={{ marginTop: '10px' }}>
                    <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>{draft.people.length} selected — any one can approve</div>
                    <PeoplePicker employees={employees} selected={draft.people} onToggle={togglePerson} />
                  </div>
                )}
                <div style={{ marginTop: '10px' }}>
                  <Field label="Label (optional)">
                    <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} placeholder="Shown to approvers, e.g. Dept Head" />
                  </Field>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                  {steps.length > 0 && <Button type="button" variant="outline" size="sm" onClick={() => { setDraft(emptyDraft()); setAdding(false); }}>Cancel step</Button>}
                  <Button type="button" size="sm" onClick={commitDraft} disabled={!draftValid}>Add step {stepN}</Button>
                </div>
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => { setDraft(emptyDraft()); setAdding(true); }}>+ Add another step</Button>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid #f1f5f9', paddingTop: '12px' }}>
              <Button type="button" variant="ghost" onClick={() => setPhase('name')}>← Name</Button>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                <Button type="button" onClick={save} disabled={saving || steps.length === 0 || !name.trim()}>{saving ? 'Saving…' : 'Save pipeline'}</Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PipelineManager({ api, pipelines, roles, employees, reload }) {
  const [wizard, setWizard] = useState(null); // null | { initial }
  const [msg, setMsg] = useState(null);

  const remove = async (p) => {
    setMsg(null);
    try { await api.delete(`/budgets/pipelines/${p.id}/`); reload(); }
    catch (err) { setMsg(apiError(err, 'Unable to delete this pipeline.')); }
  };

  return (
    <div>
      {msg && <div style={{ marginBottom: '10px' }}><Notice tone="error">{msg}</Notice></div>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {pipelines.map((p) => (
          <div key={p.id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '12px 14px', background: '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h4 style={{ margin: 0, fontSize: '14px' }}>{p.name}</h4>
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {p.usage_count ? `used by ${p.usage_count} categor${p.usage_count === 1 ? 'y' : 'ies'}/type(s)` : 'not attached yet'}
              </span>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
                <Button type="button" size="sm" variant="ghost" onClick={() => setWizard({ initial: p })}><Icon name="edit" /></Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => remove(p)}><Icon name="trash" /></Button>
              </div>
            </div>
            <div style={{ marginTop: '8px', display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' }}>
              {(p.stages || []).length === 0 ? (
                <span style={{ fontSize: '12.5px', color: '#9a3412' }}>No steps yet — tickets can't be submitted until you add some.</span>
              ) : p.stages.map((s, i) => (
                <React.Fragment key={s.id}>
                  {i > 0 && <span style={{ color: '#94a3b8' }}>→</span>}
                  <span style={{ fontSize: '12.5px', fontWeight: 600, background: '#f1f5f9', borderRadius: '6px', padding: '3px 8px' }}>
                    {s.label || s.role_name || (s.approver_kind === 'DEPT_MANAGER' ? 'Dept Manager' : `${(s.people || []).length} people`)}
                  </span>
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
        {pipelines.length === 0 && (
          <div style={{ color: '#64748b', fontSize: '13px' }}>No pipelines yet. Create one, then attach it to a budget category or expense type.</div>
        )}
      </div>

      <div style={{ marginTop: '12px' }}>
        <Button type="button" size="sm" onClick={() => setWizard({ initial: null })}>+ New pipeline</Button>
      </div>

      {wizard && (
        <PipelineWizard api={api} roles={roles} employees={employees} initial={wizard.initial}
          onClose={() => setWizard(null)} onSaved={reload} />
      )}
    </div>
  );
}

// A collapsible panel. Header shows a title, an optional count badge and an
// optional action button (e.g. "Add…"), and toggles the body open/closed.
function Collapsible({ title, hint, count, action, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section style={{ border: '1px solid #e2e8f0', borderRadius: '10px', background: '#fff', marginBottom: '12px', overflow: 'hidden' }}>
      <div role="button" tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen((o) => !o); } }}
        style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '13px 14px', cursor: 'pointer', background: open ? '#f8fafc' : '#fff' }}>
        <span style={{ display: 'inline-block', transform: open ? 'rotate(90deg)' : 'none', transition: 'transform .15s', color: '#64748b', fontSize: '11px' }}>▶</span>
        <h3 style={{ margin: 0, fontSize: '15px' }}>{title}</h3>
        {count != null && <span style={{ fontSize: '12px', fontWeight: 700, color: '#475569', background: '#e2e8f0', borderRadius: '999px', padding: '1px 8px' }}>{count}</span>}
        {action && <div style={{ marginLeft: 'auto' }} onClick={(e) => e.stopPropagation()}>{action}</div>}
      </div>
      {open && (
        <div style={{ padding: '2px 14px 14px' }}>
          {hint && <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 10px' }}>{hint}</p>}
          {children}
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Setup — department budgets, approval roles & people, claim types, pipelines
// ---------------------------------------------------------------------------
function SetupTab({ api }) {
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [roles, setRoles] = useState([]);          // BudgetRoleAssignment rows
  const [roleDefs, setRoleDefs] = useState([]);    // ApprovalRole rows
  const [pipelines, setPipelines] = useState([]);
  const [claimTypes, setClaimTypes] = useState([]);
  const [notice, setNotice] = useState('');
  const [budgetDialog, setBudgetDialog] = useState(null);
  const [roleDefDialog, setRoleDefDialog] = useState(null);
  const [claimTypeDialog, setClaimTypeDialog] = useState(null);
  const [claimSearch, setClaimSearch] = useState('');

  const loadBudgets = useCallback(() => {
    api.get('/budgets/department-budgets/').then((r) => setBudgets(normalizeList(r.data))).catch(() => setNotice('Unable to load budgets.'));
  }, [api]);
  const loadRoles = useCallback(() => {
    api.get('/budgets/role-assignments/').then((r) => setRoles(normalizeList(r.data))).catch(() => {});
  }, [api]);
  const loadRoleDefs = useCallback(() => {
    api.get('/budgets/roles/').then((r) => setRoleDefs(normalizeList(r.data))).catch(() => {});
  }, [api]);
  const loadPipelines = useCallback(() => {
    api.get('/budgets/pipelines/').then((r) => setPipelines(normalizeList(r.data))).catch(() => {});
  }, [api]);
  const loadClaimTypes = useCallback(() => {
    api.get('/budgets/claim-types/').then((r) => setClaimTypes(normalizeList(r.data))).catch(() => {});
  }, [api]);

  useEffect(() => {
    api.get('/departments/').then((r) => setDepartments(normalizeList(r.data))).catch(() => {});
    api.get('/employees/').then((r) => setEmployees(normalizeList(r.data))).catch(() => {});
    loadBudgets(); loadRoles(); loadRoleDefs(); loadPipelines(); loadClaimTypes();
  }, [api, loadBudgets, loadRoles, loadRoleDefs, loadPipelines, loadClaimTypes]);

  const saveClaimType = async () => {
    try {
      const payload = {
        name: (claimTypeDialog.name || '').trim(),
        is_active: claimTypeDialog.is_active,
        allowed_claimants: claimTypeDialog.allowed || [],
        pipeline: claimTypeDialog.pipeline || null,
      };
      if (claimTypeDialog.id) await api.put(`/budgets/claim-types/${claimTypeDialog.id}/`, payload);
      else await api.post('/budgets/claim-types/', payload);
      setClaimTypeDialog(null); loadClaimTypes();
    } catch (err) { setNotice(apiError(err, 'Unable to save expense type.')); }
  };

  const toggleAllowed = (empId) => {
    const id = Number(empId);
    const cur = claimTypeDialog.allowed || [];
    setClaimTypeDialog({ ...claimTypeDialog, allowed: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] });
  };

  const filteredEmployees = employees.filter((em) => (em.name || '').toLowerCase().includes(claimSearch.trim().toLowerCase()));
  const allFilteredSelected = filteredEmployees.length > 0 && filteredEmployees.every((em) => (claimTypeDialog?.allowed || []).includes(em.id));
  const toggleSelectAll = () => {
    const ids = filteredEmployees.map((e) => e.id);
    const cur = claimTypeDialog.allowed || [];
    setClaimTypeDialog({
      ...claimTypeDialog,
      allowed: allFilteredSelected ? cur.filter((x) => !ids.includes(x)) : [...new Set([...cur, ...ids])],
    });
  };

  const saveBudget = async () => {
    try {
      const payload = { department: budgetDialog.department, name: (budgetDialog.name || '').trim() || 'General', fiscal_year: Number(budgetDialog.fiscal_year), amount: budgetDialog.amount || 0, custodian: budgetDialog.custodian || null, pipeline: budgetDialog.pipeline || null, is_active: true };
      if (budgetDialog.id) await api.put(`/budgets/department-budgets/${budgetDialog.id}/`, payload);
      else await api.post('/budgets/department-budgets/', payload);
      setBudgetDialog(null); loadBudgets();
    } catch (err) { setNotice(apiError(err, 'Unable to save budget.')); }
  };

  // Save a role's name and sync its people in one go: create/update the role,
  // then diff the checklist against its current assignments to add/remove.
  const saveRoleDef = async () => {
    try {
      let roleId = roleDefDialog.id;
      const payload = { name: (roleDefDialog.name || '').trim(), is_active: true };
      if (roleId) await api.put(`/budgets/roles/${roleId}/`, payload);
      else { const r = await api.post('/budgets/roles/', payload); roleId = r.data.id; }
      const current = roles.filter((a) => a.role === roleId);
      const currentIds = current.map((a) => a.employee);
      const selected = roleDefDialog.selected || [];
      const toAdd = selected.filter((id) => !currentIds.includes(id));
      const toRemove = current.filter((a) => !selected.includes(a.employee));
      await Promise.all([
        ...toAdd.map((id) => api.post('/budgets/role-assignments/', { role: roleId, employee: id })),
        ...toRemove.map((a) => api.delete(`/budgets/role-assignments/${a.id}/`)),
      ]);
      setRoleDefDialog(null); loadRoleDefs(); loadRoles();
    } catch (err) { setNotice(apiError(err, 'Unable to save role.')); }
  };

  const removeRoleDef = async (id) => {
    try { await api.delete(`/budgets/roles/${id}/`); loadRoleDefs(); loadRoles(); }
    catch (err) { setNotice(apiError(err, 'Unable to delete role.')); }
  };

  // People holding each role, for the roles table.
  const peopleByRole = roles.reduce((acc, a) => { (acc[a.role] = acc[a.role] || []).push(a.employee_name); return acc; }, {});

  return (
    <div>
      {notice && <Notice tone="error">{notice}</Notice>}

      <Collapsible
        title="Department budgets"
        count={budgets.length}
        hint="Each department can have several budget categories (e.g. IT Inventory, IT Assets), each with its own monthly amount and custodian."
        action={<Button type="button" size="sm" onClick={() => setBudgetDialog({ department: '', name: '', fiscal_year: CURRENT_YEAR, amount: '', custodian: '', pipeline: '' })}>Add Budget</Button>}
      >
        <DataTable
          columns={['Department', 'Category', 'Year', 'Monthly budget', 'Custodian', 'Pipeline', '']}
          rows={budgets.map((b) => [
            b.department_name, b.name, b.fiscal_year, money(b.amount), b.custodian_name || '—', b.pipeline_name || '— none —',
            <Button type="button" variant="ghost" size="sm" onClick={() => setBudgetDialog({ id: b.id, department: b.department, name: b.name, fiscal_year: b.fiscal_year, amount: b.amount, custodian: b.custodian || '', pipeline: b.pipeline || '' })}><Icon name="edit" /></Button>,
          ])}
          empty="No budgets yet."
        />
      </Collapsible>

      <Collapsible
        title="Approval roles & people"
        count={roleDefs.length}
        hint="The roles you use in pipeline steps, and who holds each one. A role in a step can be approved by any one of its people. Edit a role to rename it and set its people."
        action={<Button type="button" size="sm" onClick={() => setRoleDefDialog({ name: '', selected: [] })}>Add Role</Button>}
      >
        <DataTable
          columns={['Role', 'People', '']}
          rows={roleDefs.map((r) => [
            r.name,
            (peopleByRole[r.id] || []).length ? (peopleByRole[r.id] || []).join(', ') : '— nobody yet —',
            <div style={{ display: 'flex', gap: '4px' }}>
              <Button type="button" variant="ghost" size="sm" onClick={() => setRoleDefDialog({ id: r.id, name: r.name, selected: roles.filter((a) => a.role === r.id).map((a) => a.employee) })}><Icon name="edit" /></Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeRoleDef(r.id)}><Icon name="trash" /></Button>
            </div>,
          ])}
          empty="No roles yet."
        />
      </Collapsible>

      <Collapsible
        title="Expense types"
        count={claimTypes.length}
        hint="The kinds of expense an employee can submit an Expense Ticket for (e.g. Car maintenance, Rent, Tour). For each type, pick who may apply and the approval pipeline it uses."
        action={<Button type="button" size="sm" onClick={() => { setClaimSearch(''); setClaimTypeDialog({ name: '', is_active: true, allowed: [], pipeline: '' }); }}>Add Type</Button>}
      >
        <DataTable
          columns={['Name', 'Who can apply', 'Pipeline', 'Status', '']}
          rows={claimTypes.map((t) => [
            t.name,
            (t.allowed_claimant_names || []).length ? (t.allowed_claimant_names || []).join(', ') : '—',
            t.pipeline_name || '— none —',
            t.is_active ? 'Active' : 'Inactive',
            <Button type="button" variant="ghost" size="sm" onClick={() => { setClaimSearch(''); setClaimTypeDialog({ id: t.id, name: t.name, is_active: t.is_active, allowed: (t.allowed_claimants || []).map(Number), pipeline: t.pipeline || '' }); }}><Icon name="edit" /></Button>,
          ])}
          empty="No expense types yet."
        />
      </Collapsible>

      <Collapsible
        title="Approval pipelines"
        count={pipelines.length}
        hint="Build a named chain once, then reuse it: attach it to any budget category or expense type. Each step is a role, specific people (any one approves), or the Department Manager. A category or type must have a pipeline attached before its tickets can be submitted."
      >
        <PipelineManager api={api} pipelines={pipelines} roles={roleDefs} employees={employees} reload={loadPipelines} />
      </Collapsible>

      <Dialog open={!!claimTypeDialog}>
        {claimTypeDialog && (
          <DialogContent className="dialog-sm">
            <DialogHeader title={claimTypeDialog.id ? 'Edit Expense Type' : 'Add Expense Type'} onClose={() => setClaimTypeDialog(null)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Field label="Name"><input value={claimTypeDialog.name} onChange={(e) => setClaimTypeDialog({ ...claimTypeDialog, name: e.target.value })} placeholder="e.g. Car maintenance" /></Field>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>Who can apply for this type</span>
                  <span style={{ fontSize: '12px', color: '#64748b' }}>{(claimTypeDialog.allowed || []).length} selected</span>
                </div>
                <input
                  type="text"
                  value={claimSearch}
                  onChange={(e) => setClaimSearch(e.target.value)}
                  placeholder="Search employee…"
                  style={{ width: '100%', boxSizing: 'border-box', margin: '6px 0', padding: '7px 10px', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '14px' }}
                />
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#475569', padding: '2px 0 6px' }}>
                  <input type="checkbox" checked={allFilteredSelected} onChange={toggleSelectAll} disabled={filteredEmployees.length === 0} />
                  Select all{claimSearch.trim() ? ' (matching)' : ''}
                </label>
                <div style={{ maxHeight: '190px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '8px' }}>
                  {filteredEmployees.length === 0 ? (
                    <span style={{ fontSize: '13px', color: '#64748b' }}>No employees found.</span>
                  ) : filteredEmployees.map((em) => (
                    <label key={em.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', padding: '3px 0' }}>
                      <input type="checkbox" checked={(claimTypeDialog.allowed || []).includes(em.id)} onChange={() => toggleAllowed(em.id)} />
                      {em.name}
                    </label>
                  ))}
                </div>
              </div>
              <Field label="Approval pipeline">
                <Select value={claimTypeDialog.pipeline || ''} onChange={(e) => setClaimTypeDialog({ ...claimTypeDialog, pipeline: e.target.value })}>
                  <option value="">— none (tickets can't be submitted) —</option>
                  {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                <input type="checkbox" checked={claimTypeDialog.is_active} onChange={(e) => setClaimTypeDialog({ ...claimTypeDialog, is_active: e.target.checked })} /> Active
              </label>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                <Button type="button" variant="outline" onClick={() => setClaimTypeDialog(null)}>Cancel</Button>
                <Button type="button" onClick={saveClaimType} disabled={!claimTypeDialog.name.trim()}>Save</Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={!!budgetDialog}>
        {budgetDialog && (
          <DialogContent className="dialog-sm">
            <DialogHeader title={budgetDialog.id ? 'Edit Budget' : 'Add Budget'} onClose={() => setBudgetDialog(null)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Field label="Department">
                <Select value={budgetDialog.department} onChange={(e) => setBudgetDialog({ ...budgetDialog, department: e.target.value })}>
                  <option value="">Select department…</option>
                  {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Field>
              <Field label="Budget category"><input value={budgetDialog.name} onChange={(e) => setBudgetDialog({ ...budgetDialog, name: e.target.value })} placeholder="e.g. IT Inventory, IT Assets" /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <Field label="Fiscal year"><input type="number" value={budgetDialog.fiscal_year} onChange={(e) => setBudgetDialog({ ...budgetDialog, fiscal_year: e.target.value })} /></Field>
                <Field label="Monthly budget (Rs)"><input type="number" step="0.01" value={budgetDialog.amount} onChange={(e) => setBudgetDialog({ ...budgetDialog, amount: e.target.value })} /></Field>
              </div>
              <Field label="Custodian">
                <Select value={budgetDialog.custodian} onChange={(e) => setBudgetDialog({ ...budgetDialog, custodian: e.target.value })}>
                  <option value="">Select person…</option>
                  {employees.map((em) => <option key={em.id} value={em.id}>{em.name}</option>)}
                </Select>
              </Field>
              <Field label="Approval pipeline">
                <Select value={budgetDialog.pipeline || ''} onChange={(e) => setBudgetDialog({ ...budgetDialog, pipeline: e.target.value })}>
                  <option value="">— none (tickets can't be submitted) —</option>
                  {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </Select>
              </Field>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <Button type="button" variant="outline" onClick={() => setBudgetDialog(null)}>Cancel</Button>
                <Button type="button" onClick={saveBudget} disabled={!budgetDialog.department}>Save</Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>


      <Dialog open={!!roleDefDialog}>
        {roleDefDialog && (
          <DialogContent className="dialog-sm">
            <DialogHeader title={roleDefDialog.id ? 'Edit Role' : 'Add Role'} onClose={() => setRoleDefDialog(null)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Field label="Role name"><input value={roleDefDialog.name} onChange={(e) => setRoleDefDialog({ ...roleDefDialog, name: e.target.value })} placeholder="e.g. Finance, CEO, Director" autoFocus /></Field>
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '2px' }}>People in this role</div>
                <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>{(roleDefDialog.selected || []).length} selected — any one of them can approve a step that uses this role.</div>
                <PeoplePicker
                  employees={employees}
                  selected={roleDefDialog.selected || []}
                  onToggle={(id) => setRoleDefDialog((d) => ({ ...d, selected: (d.selected || []).includes(id) ? d.selected.filter((x) => x !== id) : [...(d.selected || []), id] }))}
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <Button type="button" variant="outline" onClick={() => setRoleDefDialog(null)}>Cancel</Button>
                <Button type="button" onClick={saveRoleDef} disabled={!(roleDefDialog.name || '').trim()}>Save</Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

export default BudgetsPage;
