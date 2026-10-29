import React, { useState, useEffect, useCallback } from 'react';
import { normalizeList, fetchAll } from '../lib/api';
import {
  Button, Select, Dialog, DialogContent, PageHeader,
  DialogHeader, Field, Notice, DataTable,
} from '../components/ui';

// --- HELP DESK: TICKETS PORTAL (Add Ticket + My Tickets / To Resolve) ---
const TICKET_STATUSES = [
  { value: 'NEW', label: 'New' },
  { value: 'IN_PROGRESS', label: 'In Progress' },
  { value: 'RESOLVED', label: 'Resolved' },
  { value: 'REOPENED', label: 'Reopened' },
  { value: 'CLOSED', label: 'Closed' },
];

const boxStyle = { background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px' };

const STATUS_LABELS = {
  NEW: 'New', IN_PROGRESS: 'In Progress', RESOLVED: 'Resolved', REOPENED: 'Reopened', CLOSED: 'Closed',
};

// One clean label/value row in the ticket detail list.
function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '12px', padding: '9px 0', borderBottom: '1px solid #f1f5f9', fontSize: '14px' }}>
      <div style={{ color: '#64748b' }}>{label}</div>
      <div style={{ color: '#0f172a', fontWeight: 500 }}>{value}</div>
    </div>
  );
}

function GroupMembersEditor({ group, employees, onSave }) {
  const [selected, setSelected] = useState((group.members || []).map(String));
  const [saving, setSaving] = useState(false);
  const nameById = Object.fromEntries(employees.map((e) => [String(e.id), e.name]));
  const available = employees.filter((e) => !selected.includes(String(e.id)));
  const add = (id) => { if (id && !selected.includes(id)) setSelected([...selected, id]); };
  const remove = (id) => setSelected((s) => s.filter((x) => x !== id));
  const save = async () => { setSaving(true); await onSave(group.id, selected.map(Number)); setSaving(false); };
  return (
    <div>
      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
        <Select value="" onChange={(e) => { add(e.target.value); e.target.value = ''; }} style={{ maxWidth: '260px' }}>
          <option value="">+ Add agent…</option>
          {available.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
        </Select>
        <Button type="button" variant="primary" size="sm" disabled={saving} onClick={save}>{saving ? 'Saving…' : 'Save'}</Button>
      </div>
      {selected.length === 0 ? (
        <div className="cell-muted" style={{ fontSize: '12px' }}>No agents assigned yet.</div>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {selected.map((id) => (
            <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', background: '#ecfdf5', color: '#0f766e', border: '1px solid #a7f3d0', borderRadius: '999px', padding: '4px 10px', fontSize: '12px', fontWeight: 600 }}>
              {nameById[id] || `#${id}`}
              <button type="button" aria-label="Remove agent" onClick={() => remove(id)} style={{ border: 'none', background: 'transparent', color: '#0f766e', cursor: 'pointer', fontWeight: 700, lineHeight: 1, padding: 0 }}>✕</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

const emptyTicketForm = { title: '', category: '', ticket_type: '', priority: 'MEDIUM', description: '', raised_for: '' };

// Shared "Add Ticket" form — one simple form for every request (no per-type sub-forms).
// Used by both the Help Desk page and the Employee Portal so they're identical.
export function AddTicketForm({ api, onDone, onCancel, submitLabel = 'Submit Ticket' }) {
  const [categories, setCategories] = useState([]);
  const [allTypes, setAllTypes] = useState([]);
  const [form, setForm] = useState(emptyTicketForm);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/ticket-categories/').then((r) => setCategories(normalizeList(r.data))).catch(() => setError('Could not load categories.'));
    api.get('/ticket-types/').then((r) => setAllTypes(normalizeList(r.data))).catch(() => setError('Could not load ticket types.'));
  }, [api]);

  const types = form.category ? allTypes.filter((t) => String(t.category) === String(form.category) && t.is_active !== false) : [];

  const submit = async (event) => {
    event.preventDefault();
    if (!form.title || !form.category || !form.ticket_type || !form.description) {
      setError('Please fill in Title, Category, Type and Description.');
      return;
    }
    setSubmitting(true);
    setError('');
    const payload = new FormData();
    payload.append('title', form.title);
    payload.append('category', form.category);
    payload.append('ticket_type', form.ticket_type);
    payload.append('priority', form.priority);
    payload.append('description', form.description);
    try {
      const res = await api.post('/tickets/', payload);
      onDone?.(res.data);
    } catch (err) {
      const data = err.response?.data;
      setError(typeof data === 'object' && data ? Object.values(data).flat().join(' ') : 'Unable to submit ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form className="stack-form" onSubmit={submit}>
      {error && <Notice tone="error">{error}</Notice>}
      <Field label="Title *">
        <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Laptop for a new joiner" />
      </Field>
      <Field label="Category *">
        <Select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value, ticket_type: '' })}>
          <option value="">Select one</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field label="Type *">
        <Select required value={form.ticket_type} disabled={!form.category} onChange={(e) => setForm({ ...form, ticket_type: e.target.value })}>
          <option value="">{form.category ? 'Select one' : 'Pick a category first'}</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </Select>
      </Field>
      <Field label="Description *">
        <textarea required rows="4" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe your request…" />
      </Field>
      <div className="dialog-footer">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={submitting}>{submitting ? 'Submitting…' : submitLabel}</Button>
      </div>
    </form>
  );
}

export function TicketsPage({ api, isAdmin }) {
  const [tickets, setTickets] = useState([]);
  const [counts, setCounts] = useState(null);
  const [view, setView] = useState('mine'); // 'mine' | 'to_resolve'
  const [statusFilter, setStatusFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');

  // Resolution + settings
  const [activeTicket, setActiveTicket] = useState(null);
  const [agentPick, setAgentPick] = useState('');
  const [statusPick, setStatusPick] = useState('');
  const [note, setNote] = useState('');
  const [working, setWorking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [groups, setGroups] = useState([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [employees, setEmployees] = useState([]);

  useEffect(() => {
    fetchAll(api, '/employees/').then(setEmployees).catch(() => {});
  }, [api]);

  const loadTickets = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ request_type: view });
    if (statusFilter) params.set('status', statusFilter);
    return api.get(`/tickets/?${params.toString()}`)
      .then((r) => { setTickets(normalizeList(r.data)); setLoading(false); })
      .catch(() => { setNotice('Unable to load tickets.'); setLoading(false); });
  }, [api, view, statusFilter]);

  useEffect(() => { loadTickets(); }, [loadTickets]);
  useEffect(() => { api.get('/tickets/my-counts/').then((r) => setCounts(r.data)).catch(() => {}); }, [api, tickets.length]);

  const canManage = isAdmin || view === 'to_resolve';

  const openTicket = (t) => {
    setActiveTicket(t);
    setAgentPick(t.assigned_agent || '');
    setStatusPick(t.status || '');
    setNote('');
    setNotice('');
  };

  const saveAssignment = async () => {
    setWorking(true);
    try {
      const originalStatus = activeTicket.status;
      const agentChanged = !!agentPick && String(agentPick) !== String(activeTicket.assigned_agent || '');
      const statusNotify = statusPick !== originalStatus && ['IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(statusPick);
      const a = await api.post(`/tickets/${activeTicket.id}/assign/`, { assigned_agent: agentPick || '' });
      let latest = a.data;
      // Only touch status when the agent actually changed the dropdown — otherwise
      // the assign auto-move (New → In Progress) would be reverted.
      if (statusPick && statusPick !== originalStatus) {
        const r = await api.post(`/tickets/${activeTicket.id}/set-status/`, { status: statusPick, note });
        latest = r.data;
      }
      setActiveTicket(latest);
      setAgentPick(latest.assigned_agent || '');
      setStatusPick(latest.status || '');
      setNote('');
      setNotice(agentChanged || statusNotify ? 'Ticket updated — the requester has been notified by email.' : 'Ticket updated.');
      loadTickets();
    } catch (err) {
      setNotice(err.response?.data?.error || 'Unable to update ticket.');
    } finally { setWorking(false); }
  };

  const openSettings = () => {
    setSettingsOpen(true);
    api.get('/agent-groups/').then((r) => setGroups(normalizeList(r.data))).catch(() => {});
    if (employees.length === 0) fetchAll(api, '/employees/').then(setEmployees).catch(() => {});
  };

  const saveGroupMembers = async (groupId, memberIds) => {
    try {
      await api.patch(`/agent-groups/${groupId}/`, { members: memberIds });
      setGroups((gs) => gs.map((g) => g.id === groupId ? { ...g, members: memberIds } : g));
      setNotice('Group members updated.');
    } catch {
      setNotice('Unable to update group members.');
    }
  };

  const countCards = [
    { label: 'New', value: counts?.new, tone: 'blue' },
    { label: 'In Progress', value: counts?.in_progress, tone: 'amber' },
    { label: 'Resolved', value: counts?.resolved, tone: 'green' },
    { label: 'Closed', value: counts?.closed, tone: 'slate' },
    { label: 'Assigned to me', value: counts?.to_resolve, tone: 'violet' },
  ];

  return (
    <>
      <PageHeader eyebrow="Help Desk" title="Tickets">
        {isAdmin && <Button type="button" variant="outline" onClick={openSettings}>Settings</Button>}
        <Button type="button" variant="primary" onClick={() => { setDialogOpen(true); setNotice(''); }}>+ Add Ticket</Button>
      </PageHeader>
      {notice && <Notice>{notice}</Notice>}

      <div className="metric-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        {countCards.map((c) => (
          <section key={c.label} className={`metric-card ${c.tone}`} style={{ minHeight: '96px', padding: '16px' }}>
            <span>{c.label}</span>
            <strong>{c.value ?? 0}</strong>
          </section>
        ))}
      </div>

      <section className="panel">
        <div className="filter-bar" style={{ gridTemplateColumns: 'auto auto 1fr', alignItems: 'center' }}>
          <div style={{ display: 'inline-flex', gap: '6px', background: '#f1f5f9', padding: '4px', borderRadius: '8px' }}>
            <Button type="button" variant={view === 'mine' ? 'primary' : 'ghost'} size="sm" onClick={() => setView('mine')}>My Tickets</Button>
            <Button type="button" variant={view === 'to_resolve' ? 'primary' : 'ghost'} size="sm" onClick={() => setView('to_resolve')}>To Resolve</Button>
            {isAdmin && <Button type="button" variant={view === 'all' ? 'primary' : 'ghost'} size="sm" onClick={() => setView('all')}>All</Button>}
          </div>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} style={{ maxWidth: '200px' }}>
            <option value="">All Statuses</option>
            {TICKET_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </Select>
          <span />
        </div>
        <DataTable
          columns={['Code', 'Title', 'Category', 'Priority', 'Status', view === 'to_resolve' ? 'Raised By' : 'Assigned To', 'Created', '']}
          rows={tickets.map((t) => [
            <span key="c" className="cell-id">{t.code}</span>,
            <div key="t">
              <div className="cell-primary">{t.title}</div>
              {t.ticket_type_name && <div className="cell-muted" style={{ fontSize: '12px' }}>{t.ticket_type_name}</div>}
            </div>,
            t.category_name,
            (t.priority || 'Medium').charAt(0) + (t.priority || 'Medium').slice(1).toLowerCase(),
            STATUS_LABELS[t.status] || t.status,
            view === 'to_resolve'
              ? (t.raised_by_name || '—')
              : (t.assigned_group_name || <span className="cell-muted">Unassigned</span>),
            t.created_at ? new Date(t.created_at).toLocaleDateString() : '',
            <div key="act" className="row-actions">
              <Button type="button" variant="outline" size="sm" onClick={() => openTicket(t)}>Open</Button>
            </div>,
          ])}
          empty={loading ? 'Loading tickets...' : (view === 'to_resolve' ? 'No tickets assigned to you.' : 'You have not raised any tickets yet.')}
        />
      </section>

      <Dialog open={dialogOpen}>
        <DialogContent>
          <DialogHeader title="Add Ticket" description="Raise a help-desk request. It will be routed to the right team automatically." onClose={() => setDialogOpen(false)} />
          {dialogOpen && (
            <AddTicketForm
              api={api}
              onCancel={() => setDialogOpen(false)}
              onDone={(ticket) => { setDialogOpen(false); setNotice(`Ticket ${ticket?.code || ''} submitted.`); loadTickets(); }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Ticket detail / resolution */}
      <Dialog open={!!activeTicket}>
        <DialogContent>
          {activeTicket && (() => {
            const forSomeoneElse = activeTicket.raised_for_name && activeTicket.raised_for_name !== activeTicket.raised_by_name;
            const raisedBy = forSomeoneElse ? `${activeTicket.raised_by_name} (for ${activeTicket.raised_for_name})` : activeTicket.raised_by_name;
            // An email goes out only on a new assignment or a notifying status change.
            const willNotify =
              (!!agentPick && String(agentPick) !== String(activeTicket.assigned_agent || '')) ||
              (statusPick !== activeTicket.status && ['IN_PROGRESS', 'RESOLVED', 'CLOSED'].includes(statusPick));
            return (
            <>
              <DialogHeader title={`${activeTicket.code} · ${activeTicket.title}`} description={`${activeTicket.category_name} → ${activeTicket.ticket_type_name}`} onClose={() => setActiveTicket(null)} />
              <div className="stack-form">
                <div>
                  <InfoRow label="Status" value={STATUS_LABELS[activeTicket.status] || activeTicket.status} />
                  <InfoRow label="Priority" value={(activeTicket.priority || 'Medium').charAt(0) + (activeTicket.priority || 'Medium').slice(1).toLowerCase()} />
                  <InfoRow label="Raised by" value={raisedBy} />
                  <InfoRow label="Assigned to" value={activeTicket.assigned_agent_name || activeTicket.assigned_group_name || 'Not assigned'} />
                  <InfoRow label="Created" value={activeTicket.created_at ? new Date(activeTicket.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'} />
                </div>

                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>Description</div>
                  <div style={{ fontSize: '14px', color: '#1e293b', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{activeTicket.description || <span className="cell-muted">No description provided</span>}</div>
                  {activeTicket.attachment_url && (
                    <a href={activeTicket.attachment_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '8px', color: '#0f766e', fontWeight: 600, fontSize: '13px' }}>View attachment</a>
                  )}
                </div>

                {activeTicket.resolution_note && (
                  <div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>Latest note</div>
                    <div style={{ fontSize: '14px', color: '#1e293b', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{activeTicket.resolution_note}</div>
                  </div>
                )}

                {/* Staff-only controls */}
                {canManage && (
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                    <div className="form-grid" style={{ marginBottom: '12px' }}>
                      <Field label="Assign to">
                        <Select value={agentPick} onChange={(e) => setAgentPick(e.target.value)}>
                          <option value="">Nobody yet</option>
                          {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                        </Select>
                      </Field>
                      <Field label="Status">
                        <Select value={statusPick} onChange={(e) => setStatusPick(e.target.value)}>
                          {TICKET_STATUSES.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
                        </Select>
                      </Field>
                    </div>
                    <Field label="Note to requester (optional)">
                      <textarea rows="2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Sent to the requester by email — e.g. what was done, or why it's being closed." />
                    </Field>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px' }}>
                      <Button type="button" variant="primary" disabled={working} onClick={saveAssignment}>{working ? 'Saving…' : (willNotify ? 'Save & notify' : 'Save')}</Button>
                    </div>
                  </div>
                )}
              </div>
            </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Help Desk Settings — agent group membership */}
      <Dialog open={settingsOpen}>
        <DialogContent>
          <DialogHeader title="Help Desk Settings" description="Assign employees to agent groups. A ticket routes to a group; its members receive it and appear under 'To Resolve'." />
          <div className="stack-form">
            {groups.length === 0 && <p className="cell-muted">Loading groups…</p>}
            {groups.map((g) => (
              <div key={g.id} style={boxStyle}>
                <div style={{ fontWeight: 700, color: '#0f172a' }}>{g.name}</div>
                {g.description && <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '8px' }}>{g.description}</div>}
                <GroupMembersEditor group={g} employees={employees} onSave={saveGroupMembers} />
              </div>
            ))}
          </div>
          <div className="dialog-footer">
            <Button type="button" variant="ghost" onClick={() => setSettingsOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default TicketsPage;
