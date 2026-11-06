import React, { useState, useEffect, useCallback } from 'react';
import { normalizeList, apiError } from '../lib/api';
import { Button, Select, Dialog, DialogContent, DialogHeader, Field, Notice } from '../components/ui';

const money = (n) =>
  n === null || n === undefined || n === '' ? '—' : `Rs ${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;

const KINDS = [{ value: 'REIMBURSEMENT', label: 'Reimbursement (already spent)' }, { value: 'ADVANCE', label: 'Advance (money first)' }];

// The expense-claim form, used inside the portal's "My Request" flow.
export function AddClaimForm({ api, onDone, onCancel, submitLabel = 'Submit' }) {
  const [types, setTypes] = useState([]);
  const [form, setForm] = useState({ claim_type: '', kind: 'REIMBURSEMENT', amount: '', reason: '', file: null });
  const [notice, setNotice] = useState('');
  const [working, setWorking] = useState(false);

  useEffect(() => {
    api.get('/budgets/claim-types/?is_active=true&mine=1').then((r) => setTypes(normalizeList(r.data))).catch(() => {});
  }, [api]);

  const submit = async () => {
    setWorking(true);
    try {
      const fd = new FormData();
      fd.append('claim_type', form.claim_type);
      fd.append('kind', form.kind);
      fd.append('amount', form.amount || 0);
      if (form.reason) fd.append('reason', form.reason);
      if (form.file) fd.append('bill', form.file);
      await api.post('/budgets/expense-claims/', fd);
      if (onDone) onDone();
    } catch (err) { setNotice(apiError(err, 'Unable to submit Expense Ticket.')); } finally { setWorking(false); }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      {notice && <Notice tone="error">{notice}</Notice>}
      <Field label="Expense type">
        <Select value={form.claim_type} onChange={(e) => setForm({ ...form, claim_type: e.target.value })}>
          <option value="">Select type…</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </Field>
      <Field label="Kind">
        <Select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
          {KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </Select>
      </Field>
      <Field label="Amount (Rs)"><input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></Field>
      <Field label="Reason"><textarea rows={3} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="What is this expense for?" /></Field>
      <Field label={form.kind === 'REIMBURSEMENT' ? 'Bill / receipt' : 'Bill / receipt (optional, can add later)'}>
        <input type="file" onChange={(e) => setForm({ ...form, file: e.target.files?.[0] || null })} />
      </Field>
      <p style={{ fontSize: '12.5px', color: '#64748b', margin: 0 }}>Goes through this expense type's approval pipeline. You'll be emailed when it's approved.</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
        {onCancel && <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>}
        <Button type="button" onClick={submit} disabled={working || !form.claim_type || !(Number(form.amount) > 0)}>{working ? 'Submitting…' : submitLabel}</Button>
      </div>
    </div>
  );
}

// View-only tracker shown in the Employee Portal for people who can claim.
// Applying happens in the "My Request" dialog; this lists status + lets the
// employee add a bill afterwards.
export function MyExpenseClaims({ api, refresh = 0 }) {
  const [allowed, setAllowed] = useState(null);
  const [claims, setClaims] = useState([]);
  const [notice, setNotice] = useState('');
  const [view, setView] = useState(null);

  useEffect(() => {
    api.get('/budgets/my-access/').then((r) => setAllowed(!!r.data?.is_claimant)).catch(() => setAllowed(false));
  }, [api]);

  const load = useCallback(() => {
    api.get('/budgets/expense-claims/?scope=mine').then((r) => setClaims(normalizeList(r.data))).catch(() => {});
  }, [api]);
  useEffect(() => { if (allowed) load(); }, [allowed, load, refresh]);

  const cancelClaim = async (id) => {
    if (!window.confirm('Cancel this Expense Ticket?')) return;
    try { await api.post(`/budgets/expense-claims/${id}/cancel/`); load(); } catch (err) { setNotice(apiError(err, 'Unable to cancel.')); }
  };

  const addBill = async (id, file) => {
    if (!file) return;
    try {
      const fd = new FormData(); fd.append('bill', file);
      await api.post(`/budgets/expense-claims/${id}/add-bill/`, fd);
      const r = await api.get('/budgets/expense-claims/?scope=mine');
      const list = normalizeList(r.data); setClaims(list);
      setView(list.find((c) => c.id === id) || null);
    } catch (err) { setNotice(apiError(err, 'Unable to attach bill.')); }
  };

  if (!allowed) return null;

  const dotColor = (status) => ({
    PENDING: '#f59e0b',
    PENDING_MANAGER: '#f59e0b', PENDING_FINANCE: '#f59e0b', PENDING_CEO: '#f59e0b',
    APPROVED: '#10b981', REJECTED: '#ef4444', CANCELLED: '#94a3b8',
  }[status] || '#94a3b8');
  const shortStatus = (c) => (c.next_with ? `With ${c.next_with}` : c.status_label);

  return (
    <div>
      {notice && <Notice tone={notice.includes('Unable') ? 'error' : 'success'}>{notice}</Notice>}
      <div style={{ fontSize: '13px', fontWeight: 700, color: '#334155', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: '8px' }}>Your Expense Tickets</div>
      {claims.length === 0 ? (
        <p className="empty-state">You have not raised any Expense Tickets yet.</p>
      ) : (
        <div>
          {claims.map((c) => (
            <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 600, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.claim_type_name || 'Expense Ticket'}</div>
                <div style={{ fontSize: '12px', color: '#64748b' }}>{c.kind_label} · {money(c.amount)} · {new Date(c.created_at).toLocaleDateString()}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', whiteSpace: 'nowrap' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#334155' }}>
                  <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: dotColor(c.status) }} />
                  {shortStatus(c)}
                </span>
                <Button type="button" variant="outline" size="sm" onClick={() => setView(c)}>View</Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Dialog open={!!view}>
        {view && (
          <DialogContent className="dialog-sm">
            <DialogHeader title={`Ticket #${view.id}`} onClose={() => setView(null)} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '14px' }}>
              <div><strong>{view.claim_type_name || '—'}</strong> · {view.kind_label} · {money(view.amount)}</div>
              <div style={{ color: '#475569' }}>Status: {view.status_label}{view.next_with ? ` (with ${view.next_with})` : ''}</div>
              {view.reason && <div style={{ color: '#334155' }}>{view.reason}</div>}
              {(view.history || []).length > 0 && (
                <div style={{ fontSize: '12.5px', color: '#64748b' }}>
                  {view.history.map((h) => `${h.stage}: ${h.status.toLowerCase()}${h.note ? ` (${h.note})` : ''}`).join('  ·  ')}
                </div>
              )}
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, margin: '4px 0' }}>Bills</div>
                {(view.bills || []).length
                  ? (view.bills || []).map((b, i) => <a key={b.id} href={b.file_url} target="_blank" rel="noreferrer" style={{ marginRight: '8px', color: '#2563eb' }}>bill{i + 1}</a>)
                  : <span style={{ color: '#64748b', fontSize: '13px' }}>None yet.</span>}
                {['PENDING', 'PENDING_MANAGER', 'PENDING_FINANCE', 'PENDING_CEO', 'APPROVED'].includes(view.status) && (
                  <div style={{ marginTop: '8px' }}>
                    <input type="file" onChange={(e) => addBill(view.id, e.target.files?.[0])} />
                  </div>
                )}
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                {['PENDING', 'PENDING_MANAGER', 'PENDING_FINANCE', 'PENDING_CEO'].includes(view.status)
                  ? <Button type="button" variant="ghost" onClick={() => { cancelClaim(view.id); setView(null); }}>Cancel Ticket</Button>
                  : <span />}
                <Button type="button" variant="outline" onClick={() => setView(null)}>Close</Button>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

export default MyExpenseClaims;
