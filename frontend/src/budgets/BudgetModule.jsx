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
const ROLE_OPTIONS = [{ value: 'FINANCE', label: 'Finance' }, { value: 'CEO', label: 'CEO' }];

export function BudgetsPage({ api }) {
  const [access, setAccess] = useState(null);
  const [tab, setTab] = useState(() => { try { return sessionStorage.getItem('budgets:tab') || ''; } catch { return ''; } });

  useEffect(() => {
    api.get('/budgets/my-access/').then((r) => setAccess(r.data)).catch(() => setAccess({}));
  }, [api]);

  const tabs = useMemo(() => {
    if (!access) return [];
    const t = [];
    if (access.department || access.is_admin) t.push({ key: 'mybudget', label: 'My Budget' });
    if (access.is_finance || access.is_ceo || access.approvals_count) {
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
      {activeTab === 'mybudget' && <MyBudgetTab api={api} access={access} />}
      {activeTab === 'approvals' && <ApprovalsTab api={api} />}
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
// My Budget — apply, see balance, log expenses + bills, close month
// ---------------------------------------------------------------------------
function MyBudgetTab({ api, access }) {
  const [departments, setDepartments] = useState([]);
  const [deptId, setDeptId] = useState(access.department ? String(access.department) : '');
  const [summary, setSummary] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [myRequests, setMyRequests] = useState([]);
  const [notice, setNotice] = useState('');
  const [reqDialog, setReqDialog] = useState(null);
  const [expDialog, setExpDialog] = useState(null);
  const [openingDialog, setOpeningDialog] = useState(null);
  const [working, setWorking] = useState(false);

  useEffect(() => {
    if (access.is_admin) api.get('/departments/').then((r) => setDepartments(normalizeList(r.data))).catch(() => {});
  }, [api, access.is_admin]);

  const load = useCallback(() => {
    if (!deptId) { setSummary(null); setExpenses([]); setMyRequests([]); return; }
    api.get(`/budgets/cycles/summary/?department=${deptId}`).then((r) => {
      setSummary(r.data);
      const cycleId = r.data?.cycle?.id;
      if (cycleId) {
        api.get(`/budgets/expenses/?cycle=${cycleId}`).then((er) => setExpenses(normalizeList(er.data))).catch(() => {});
        api.get(`/budgets/advance-requests/?scope=mine&cycle=${cycleId}`).then((rr) => setMyRequests(normalizeList(rr.data))).catch(() => {});
      } else { setExpenses([]); setMyRequests([]); }
    }).catch(() => setNotice('Unable to load your budget.'));
  }, [api, deptId]);

  useEffect(() => { load(); }, [load]);

  const bal = summary?.balance || {};
  const cycle = summary?.cycle;
  const closed = cycle?.status === 'CLOSED';
  const monthlyBudget = summary?.monthly_budget != null ? Number(summary.monthly_budget) : null;
  const budgetThisMonth = Number(bal.opening_balance || 0) + Number(bal.received || 0);

  const submitRequest = async () => {
    setWorking(true);
    try {
      await api.post('/budgets/advance-requests/', { department: deptId, amount: reqDialog.amount || 0, reason: reqDialog.reason || '' });
      setReqDialog(null); setNotice('Budget request sent to Finance.'); load();
    } catch (err) { setNotice(apiError(err, 'Unable to submit request.')); } finally { setWorking(false); }
  };

  const submitExpense = async () => {
    setWorking(true);
    try {
      const fd = new FormData();
      fd.append('department', deptId);
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
    if (!window.confirm('Cancel this request?')) return;
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
        <div>
          {access.is_admin ? (
            <Select value={deptId} onChange={(e) => setDeptId(e.target.value)}>
              <option value="">Select department…</option>
              {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </Select>
          ) : (
            <strong style={{ fontSize: '16px' }}>{access.department_name || 'My Department'}</strong>
          )}
          {cycle && <span style={{ marginLeft: '10px', color: '#64748b', fontSize: '14px' }}>{MONTHS[cycle.month]} {cycle.year}{closed ? ' · closed' : ''}</span>}
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <Button type="button" size="sm" disabled={!deptId} onClick={() => setReqDialog({ amount: monthlyBudget ?? '', reason: '' })}>Apply for Budget</Button>
          {cycle && !closed && <Button type="button" size="sm" variant="outline" onClick={closeMonth}>Close Month</Button>}
        </div>
      </div>

      {!deptId ? (
        <div style={{ padding: '24px', color: '#64748b', fontSize: '14px', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>Select a department to view its budget.</div>
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
            <h3 style={{ margin: 0, fontSize: '15px' }}>This month's budget requests</h3>
            <p style={{ margin: '2px 0 0', fontSize: '12.5px', color: '#64748b' }}>Each approved request adds to this month's budget. Apply again anytime you need more.</p>
          </div>
          <DataTable
            columns={['#', 'Amount', 'Status', '']}
            rows={myRequests.map((r) => [
              r.id, money(r.amount), r.status_label,
              ['DRAFT', 'PENDING_FINANCE', 'PENDING_CEO'].includes(r.status)
                ? <Button type="button" variant="ghost" size="sm" onClick={() => cancelRequest(r.id)}>Cancel</Button>
                : '',
            ])}
            empty="No budget requested for this month yet. Use 'Apply for Budget' above."
          />
        </>
      )}

      <Dialog open={!!reqDialog}>
        {reqDialog && (
          <DialogContent className="dialog-sm">
            <DialogHeader title="Apply for Budget" onClose={() => setReqDialog(null)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Field label="Amount (Rs)"><input type="number" step="0.01" value={reqDialog.amount} onChange={(e) => setReqDialog({ ...reqDialog, amount: e.target.value })} /></Field>
              <Field label="Reason"><textarea rows={3} value={reqDialog.reason} onChange={(e) => setReqDialog({ ...reqDialog, reason: e.target.value })} placeholder="What is this budget for?" /></Field>
              <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>This goes to Finance, then the CEO. You'll be emailed when it's approved.</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <Button type="button" variant="outline" onClick={() => setReqDialog(null)}>Cancel</Button>
                <Button type="button" onClick={submitRequest} disabled={working || !(Number(reqDialog.amount) > 0)}>{working ? 'Sending…' : 'Send Request'}</Button>
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
function ApprovalsTab({ api }) {
  const [rows, setRows] = useState([]);
  const [notice, setNotice] = useState('');
  const [dialog, setDialog] = useState(null);
  const [working, setWorking] = useState(false);

  const load = useCallback(() => {
    api.get('/budgets/advance-requests/?scope=approvals').then((r) => setRows(normalizeList(r.data))).catch(() => setNotice('Unable to load approvals.'));
  }, [api]);
  useEffect(() => { load(); }, [load]);

  const act = async () => {
    setWorking(true);
    try {
      const { req, approve, note } = dialog;
      await api.post(`/budgets/advance-requests/${req.id}/${approve ? 'approve' : 'reject'}/`, { note: note || '' });
      setDialog(null); setNotice(approve ? 'Approved.' : 'Rejected.'); load();
    } catch (err) { setNotice(apiError(err, 'Unable to update request.')); } finally { setWorking(false); }
  };

  return (
    <div>
      {notice && <Notice tone={notice.includes('Unable') ? 'error' : 'success'}>{notice}</Notice>}
      {rows.length === 0 ? (
        <div style={{ padding: '24px', color: '#64748b', fontSize: '14px', border: '1px dashed #cbd5e1', borderRadius: '8px' }}>Nothing is waiting for your approval.</div>
      ) : rows.map((req) => (
        <div key={req.id} style={{ border: '1px solid #e2e8f0', borderRadius: '10px', padding: '16px', marginBottom: '12px', background: '#fff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontWeight: 700 }}>#{req.id} · {req.department_name} · {money(req.amount)}</div>
              <div style={{ fontSize: '13px', color: '#475569', marginTop: '2px' }}>By {req.requested_by_name || '—'} · waiting on {req.next_with}</div>
              {req.reason && <div style={{ fontSize: '13px', color: '#334155', marginTop: '6px' }}>{req.reason}</div>}
              {(req.history || []).length > 0 && (
                <div style={{ fontSize: '12px', color: '#64748b', marginTop: '8px' }}>
                  {req.history.map((h) => `${h.stage}: ${h.status.toLowerCase()}${h.note ? ` (${h.note})` : ''}`).join('  ·  ')}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <Button type="button" size="sm" onClick={() => setDialog({ req, approve: true, note: '' })}>Approve</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ req, approve: false, note: '' })}>Reject</Button>
            </div>
          </div>
        </div>
      ))}

      <Dialog open={!!dialog}>
        {dialog && (
          <DialogContent className="dialog-sm">
            <DialogHeader title={dialog.approve ? `Approve request #${dialog.req.id}` : `Reject request #${dialog.req.id}`} onClose={() => setDialog(null)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Field label="Note (optional)"><textarea rows={3} value={dialog.note} onChange={(e) => setDialog({ ...dialog, note: e.target.value })} placeholder={dialog.approve ? 'Any note for the requester' : 'Reason for rejection'} /></Field>
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
// Setup — department budgets + who is Finance / CEO
// ---------------------------------------------------------------------------
function SetupTab({ api }) {
  const [departments, setDepartments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [budgets, setBudgets] = useState([]);
  const [roles, setRoles] = useState([]);
  const [notice, setNotice] = useState('');
  const [budgetDialog, setBudgetDialog] = useState(null);
  const [roleDialog, setRoleDialog] = useState(null);

  const loadBudgets = useCallback(() => {
    api.get('/budgets/department-budgets/').then((r) => setBudgets(normalizeList(r.data))).catch(() => setNotice('Unable to load budgets.'));
  }, [api]);
  const loadRoles = useCallback(() => {
    api.get('/budgets/role-assignments/').then((r) => setRoles(normalizeList(r.data))).catch(() => {});
  }, [api]);

  useEffect(() => {
    api.get('/departments/').then((r) => setDepartments(normalizeList(r.data))).catch(() => {});
    api.get('/employees/').then((r) => setEmployees(normalizeList(r.data))).catch(() => {});
    loadBudgets(); loadRoles();
  }, [api, loadBudgets, loadRoles]);

  const saveBudget = async () => {
    try {
      const payload = { department: budgetDialog.department, fiscal_year: Number(budgetDialog.fiscal_year), amount: budgetDialog.amount || 0, custodian: budgetDialog.custodian || null, is_active: true };
      if (budgetDialog.id) await api.put(`/budgets/department-budgets/${budgetDialog.id}/`, payload);
      else await api.post('/budgets/department-budgets/', payload);
      setBudgetDialog(null); loadBudgets();
    } catch (err) { setNotice(apiError(err, 'Unable to save budget.')); }
  };

  const saveRole = async () => {
    try {
      await api.post('/budgets/role-assignments/', { role: roleDialog.role, employee: roleDialog.employee });
      setRoleDialog(null); loadRoles();
    } catch (err) { setNotice(apiError(err, 'Unable to save.')); }
  };

  const removeRole = async (id) => {
    try { await api.delete(`/budgets/role-assignments/${id}/`); loadRoles(); } catch (err) { setNotice(apiError(err, 'Unable to remove.')); }
  };

  return (
    <div>
      {notice && <Notice tone="error">{notice}</Notice>}

      <section style={{ marginBottom: '28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '15px' }}>Department budgets</h3>
          <Button type="button" size="sm" onClick={() => setBudgetDialog({ department: '', fiscal_year: CURRENT_YEAR, amount: '', custodian: '' })}>Add Budget</Button>
        </div>
        <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 10px' }}>The fixed monthly amount each department can request, and the person who manages it.</p>
        <DataTable
          columns={['Department', 'Year', 'Monthly budget', 'Custodian', '']}
          rows={budgets.map((b) => [
            b.department_name, b.fiscal_year, money(b.amount), b.custodian_name || '—',
            <Button type="button" variant="ghost" size="sm" onClick={() => setBudgetDialog({ id: b.id, department: b.department, fiscal_year: b.fiscal_year, amount: b.amount, custodian: b.custodian || '' })}><Icon name="edit" /></Button>,
          ])}
          empty="No department budgets yet."
        />
      </section>

      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
          <h3 style={{ margin: 0, fontSize: '15px' }}>Who approves</h3>
          <Button type="button" size="sm" onClick={() => setRoleDialog({ role: 'FINANCE', employee: '' })}>Add Person</Button>
        </div>
        <p style={{ color: '#64748b', fontSize: '13px', margin: '0 0 10px' }}>Every budget request goes to Finance, then the CEO. Name who fills each role.</p>
        <DataTable
          columns={['Role', 'Person', '']}
          rows={roles.map((a) => [
            a.role_label, a.employee_name,
            <Button type="button" variant="ghost" size="sm" onClick={() => removeRole(a.id)}><Icon name="trash" /></Button>,
          ])}
          empty="No approvers set yet."
        />
      </section>

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
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <Button type="button" variant="outline" onClick={() => setBudgetDialog(null)}>Cancel</Button>
                <Button type="button" onClick={saveBudget} disabled={!budgetDialog.department}>Save</Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>

      <Dialog open={!!roleDialog}>
        {roleDialog && (
          <DialogContent className="dialog-sm">
            <DialogHeader title="Add Approver" onClose={() => setRoleDialog(null)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Field label="Role">
                <Select value={roleDialog.role} onChange={(e) => setRoleDialog({ ...roleDialog, role: e.target.value })}>
                  {ROLE_OPTIONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                </Select>
              </Field>
              <Field label="Person">
                <Select value={roleDialog.employee} onChange={(e) => setRoleDialog({ ...roleDialog, employee: e.target.value })}>
                  <option value="">Select person…</option>
                  {employees.map((em) => <option key={em.id} value={em.id}>{em.name}</option>)}
                </Select>
              </Field>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
                <Button type="button" variant="outline" onClick={() => setRoleDialog(null)}>Cancel</Button>
                <Button type="button" onClick={saveRole} disabled={!roleDialog.role || !roleDialog.employee}>Save</Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

export default BudgetsPage;
