import React, { useState, useEffect, useCallback } from 'react';
import { normalizeList, fetchAll } from '../lib/api';
import {
  Button, Select, Dialog, DialogContent, PageHeader,
  DialogHeader, Field, Notice, DataTable,
} from '../components/ui';

// --- HELP DESK: TICKETS PORTAL (Add Ticket + My Tickets / To Resolve) ---
const TICKET_PRIORITIES = [
  { value: 'HIGH', label: 'High' },
  { value: 'MEDIUM', label: 'Medium' },
  { value: 'LOW', label: 'Low' },
];

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
const emptyAssetFields = { requested_device_type: 'Laptop', specifications: '', target_employee: '', asset: '', vendor: '', expected_return_date: '' };

// Which extra asset fields each action needs.
function assetFieldsFor(action) {
  switch (action) {
    case 'ASSIGN': return ['requested_device_type', 'specifications', 'target_employee'];
    case 'ADD': return ['requested_device_type', 'specifications'];
    case 'TRANSFER': return ['asset', 'target_employee'];
    case 'RETURN': return ['asset'];
    case 'REPAIR': return ['asset', 'vendor', 'expected_return_date'];
    default: return [];
  }
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
  const [working, setWorking] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [groups, setGroups] = useState([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [categories, setCategories] = useState([]);
  const [allTypes, setAllTypes] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [form, setForm] = useState(emptyTicketForm);
  const [assetForm, setAssetForm] = useState(emptyAssetFields);
  const [assets, setAssets] = useState([]);
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/ticket-categories/').then((r) => setCategories(normalizeList(r.data))).catch(() => setNotice('Could not load categories.'));
    api.get('/ticket-types/').then((r) => setAllTypes(normalizeList(r.data))).catch(() => setNotice('Could not load ticket types.'));
    fetchAll(api, '/employees/').then(setEmployees).catch(() => {});
  }, [api]);

  // Type options are the types of the selected category (filtered client-side).
  const types = form.category ? allTypes.filter((t) => String(t.category) === String(form.category)) : [];

  // The selected type decides whether this is an asset request (and which fields).
  const selectedType = allTypes.find((t) => String(t.id) === String(form.ticket_type));
  const assetAction = selectedType?.asset_action || '';
  const extraFields = assetFieldsFor(assetAction);

  // Lazily load assets when an action needs an existing asset.
  useEffect(() => {
    if (assetFieldsFor(assetAction).includes('asset') && assets.length === 0) {
      api.get('/assets/?page_size=500').then((r) => setAssets(normalizeList(r.data))).catch(() => {});
    }
  }, [api, assetAction, assets.length]);

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

  const submitTicket = async (event) => {
    event.preventDefault();
    if (!form.title || !form.category || !form.ticket_type || !form.description) {
      setNotice('Please fill in Title, Category, Type and Description.');
      return;
    }
    setSubmitting(true);
    setNotice('');
    const payload = new FormData();
    payload.append('title', form.title);
    payload.append('category', form.category);
    payload.append('ticket_type', form.ticket_type);
    payload.append('priority', form.priority);
    payload.append('description', form.description);
    if (form.raised_for) payload.append('raised_for', form.raised_for);
    // Asset-request types carry extra fields for the linked AssetActionRequest.
    extraFields.forEach((f) => { if (assetForm[f]) payload.append(f, assetForm[f]); });
    if (file) payload.append('attachment', file);
    try {
      const res = await api.post('/tickets/', payload);
      setNotice(`Ticket ${res.data?.code || ''} submitted.`);
      setDialogOpen(false);
      setForm(emptyTicketForm);
      setAssetForm(emptyAssetFields);
      setFile(null);
      loadTickets();
    } catch (err) {
      const data = err.response?.data;
      setNotice(typeof data === 'object' && data ? Object.values(data).flat().join(' ') : 'Unable to submit ticket.');
    } finally {
      setSubmitting(false);
    }
  };

  const canManage = isAdmin || view === 'to_resolve';

  const openTicket = (t) => {
    setActiveTicket(t);
    setAgentPick(t.assigned_agent || '');
    setStatusPick(t.status || '');
    setNotice('');
  };

  const saveAssignment = async () => {
    setWorking(true);
    try {
      await api.post(`/tickets/${activeTicket.id}/assign/`, { assigned_agent: agentPick || '' });
      const r = await api.post(`/tickets/${activeTicket.id}/set-status/`, { status: statusPick });
      setActiveTicket(r.data);
      setAgentPick(r.data.assigned_agent || '');
      setStatusPick(r.data.status || '');
      setNotice('Ticket updated.');
      loadTickets();
    } catch (err) {
      setNotice(err.response?.data?.error || 'Unable to update ticket.');
    } finally { setWorking(false); }
  };

  const decideAsset = async (decision) => {
    if (!activeTicket?.action_request) return;
    setWorking(true);
    try {
      await api.post(`/requests/${activeTicket.action_request}/${decision}/`, { admin_remarks: '' });
      setNotice(decision === 'approve' ? 'Request approved — operation performed.' : 'Request rejected.');
      loadTickets();
      setActiveTicket(null);
    } catch (err) {
      setNotice(err.response?.data?.error || 'Unable to process the request.');
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
          <DialogHeader title="Add Ticket" description="Raise a help-desk request. It will be routed to the right team automatically." />
          <form className="dialog-form stack-form" onSubmit={submitTicket}>
            <Field label="Raised For (leave blank for yourself)">
              <Select value={form.raised_for} onChange={(e) => setForm({ ...form, raised_for: e.target.value })}>
                <option value="">Myself</option>
                {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </Select>
            </Field>
            <Field label="Title *">
              <input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Laptop required for new joiner" />
            </Field>
            <div className="form-grid">
              <Field label="Category *">
                <Select required value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value, ticket_type: '' })}>
                  <option value="">Select One</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Type *">
                <Select required value={form.ticket_type} disabled={!form.category} onChange={(e) => setForm({ ...form, ticket_type: e.target.value })}>
                  <option value="">{form.category ? 'Select One' : 'Pick a category first'}</option>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
              <Field label="Priority">
                <Select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                  {TICKET_PRIORITIES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
                </Select>
              </Field>
            </div>

            {assetAction && (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '12px', display: 'grid', gap: '12px' }}>
                <div style={{ fontSize: '12px', fontWeight: 700, color: '#0f766e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Asset Request Details — {selectedType?.name}
                </div>
                {extraFields.includes('requested_device_type') && (
                  <Field label="Device Type">
                    <input value={assetForm.requested_device_type} onChange={(e) => setAssetForm({ ...assetForm, requested_device_type: e.target.value })} placeholder="e.g. Laptop, Monitor, Keyboard" />
                  </Field>
                )}
                {extraFields.includes('asset') && (
                  <Field label="Asset *">
                    <Select required value={assetForm.asset} onChange={(e) => setAssetForm({ ...assetForm, asset: e.target.value })}>
                      <option value="">Select asset</option>
                      {assets.map((a) => <option key={a.id} value={a.id}>{a.miczon_id} — {a.name}</option>)}
                    </Select>
                  </Field>
                )}
                {extraFields.includes('target_employee') && (
                  <Field label={assetAction === 'TRANSFER' ? 'Transfer To *' : 'For Employee'}>
                    <Select value={assetForm.target_employee} onChange={(e) => setAssetForm({ ...assetForm, target_employee: e.target.value })}>
                      <option value="">{assetAction === 'TRANSFER' ? 'Select employee' : 'Myself'}</option>
                      {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                    </Select>
                  </Field>
                )}
                {extraFields.includes('vendor') && (
                  <Field label="Repair Vendor">
                    <input value={assetForm.vendor} onChange={(e) => setAssetForm({ ...assetForm, vendor: e.target.value })} placeholder="Vendor / workshop name" />
                  </Field>
                )}
                {extraFields.includes('expected_return_date') && (
                  <Field label="Expected Return Date">
                    <input type="date" value={assetForm.expected_return_date} onChange={(e) => setAssetForm({ ...assetForm, expected_return_date: e.target.value })} />
                  </Field>
                )}
                {extraFields.includes('specifications') && (
                  <Field label="Specifications">
                    <textarea rows="2" value={assetForm.specifications} onChange={(e) => setAssetForm({ ...assetForm, specifications: e.target.value })} placeholder="Required specs / details" />
                  </Field>
                )}
              </div>
            )}

            <Field label="Description *">
              <textarea required rows="4" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Describe your request in detail..." />
            </Field>
            <Field label="Attachment (PDF, JPG, PNG — optional)">
              <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            </Field>
            <div className="dialog-footer">
              <Button type="button" variant="ghost" onClick={() => { setDialogOpen(false); setForm(emptyTicketForm); setAssetForm(emptyAssetFields); setFile(null); }}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={submitting}>{submitting ? 'Submitting...' : 'Submit Ticket'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Ticket detail / resolution */}
      <Dialog open={!!activeTicket}>
        <DialogContent>
          {activeTicket && (() => {
            const forSomeoneElse = activeTicket.raised_for_name && activeTicket.raised_for_name !== activeTicket.raised_by_name;
            const raisedBy = forSomeoneElse ? `${activeTicket.raised_by_name} (for ${activeTicket.raised_for_name})` : activeTicket.raised_by_name;
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
                  {activeTicket.action_request && (
                    <InfoRow label="Asset request" value={(activeTicket.action_request_status || 'pending').charAt(0) + (activeTicket.action_request_status || 'pending').slice(1).toLowerCase()} />
                  )}
                </div>

                <div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: '#334155', marginBottom: '6px' }}>Description</div>
                  <div style={{ fontSize: '14px', color: '#1e293b', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{activeTicket.description || <span className="cell-muted">No description provided</span>}</div>
                  {activeTicket.attachment_url && (
                    <a href={activeTicket.attachment_url} target="_blank" rel="noreferrer" style={{ display: 'inline-block', marginTop: '8px', color: '#0f766e', fontWeight: 600, fontSize: '13px' }}>View attachment</a>
                  )}
                </div>

                {/* Staff-only controls */}
                {canManage && (
                  <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                    <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                      <Field label="Assign to" style={{ flex: '1 1 180px', margin: 0 }}>
                        <Select value={agentPick} onChange={(e) => setAgentPick(e.target.value)}>
                          <option value="">Nobody yet</option>
                          {employees.map((emp) => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                        </Select>
                      </Field>
                      <Field label="Status" style={{ flex: '1 1 160px', margin: 0 }}>
                        <Select value={statusPick} onChange={(e) => setStatusPick(e.target.value)}>
                          {TICKET_STATUSES.map((st) => <option key={st.value} value={st.value}>{st.label}</option>)}
                        </Select>
                      </Field>
                      <Button type="button" variant="primary" disabled={working} onClick={saveAssignment}>{working ? 'Saving…' : 'Save'}</Button>
                    </div>
                    {isAdmin && activeTicket.action_request && activeTicket.action_request_status === 'PENDING' && (
                      <div style={{ marginTop: '14px', borderTop: '1px solid #e2e8f0', paddingTop: '14px', display: 'flex', gap: '8px' }}>
                        <Button type="button" variant="primary" disabled={working} onClick={() => decideAsset('approve')}>Approve request</Button>
                        <Button type="button" variant="danger" disabled={working} onClick={() => decideAsset('reject')}>Reject</Button>
                      </div>
                    )}
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
