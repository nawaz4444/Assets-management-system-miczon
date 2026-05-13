/* eslint-disable react-refresh/only-export-components, react-hooks/set-state-in-effect */
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Login from './Login';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import { API_BASE, BACKEND_BASE } from './utils/config';
import './styles.css';

export const UserContext = createContext(null);
export { BACKEND_BASE };

const navItems = [
  { path: '/', label: 'Dashboard', icon: 'grid' },
  { path: '/inventory', label: 'Inventory', icon: 'box' },
  { path: '/employees', label: 'Employees', icon: 'users' },
  { path: '/requests', label: 'Requests', icon: 'inbox' },
  { path: '/health-checks', label: 'Health Checks', icon: 'pulse' },
  { path: '/portal', label: 'Employee Portal', icon: 'user' },
];

const emptyAsset = {
  miczon_id: '',
  name: '',
  category: 'Laptop',
  current_status: 'AVAILABLE',
  custodian: '',
  specifications: '',
};

function Icon({ name }) {
  return <span className={`app-icon app-icon-${name}`} aria-hidden="true" />;
}

function useApi(token) {
  return useMemo(() => {
    const headers = { Authorization: `Token ${token}` };
    return {
      get: (url, config = {}) => axios.get(`${API_BASE}${url}`, { ...config, headers }),
      post: (url, data = {}, config = {}) => axios.post(`${API_BASE}${url}`, data, { ...config, headers }),
      patch: (url, data = {}, config = {}) => axios.patch(`${API_BASE}${url}`, data, { ...config, headers }),
      delete: (url, config = {}) => axios.delete(`${API_BASE}${url}`, { ...config, headers }),
    };
  }, [token]);
}

function normalizeList(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.results || [];
}

function toApiPath(url) {
  if (!url) return '';
  if (url.startsWith('http')) {
    const parsed = new URL(url);
    return `${parsed.pathname.replace('/api', '')}${parsed.search}`;
  }
  return url;
}

async function fetchAll(api, initialPath) {
  const rows = [];
  let path = initialPath;

  while (path) {
    const response = await api.get(toApiPath(path));
    rows.push(...normalizeList(response.data));
    path = response.data?.next || '';
  }

  return rows;
}

function AppShell({ token, handleLogout }) {
  const location = useLocation();
  const { user } = useContext(UserContext);
  const api = useApi(token);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link className="brand" to="/">
          <span className="brand-mark">IT</span>
          <span>
            <strong>Asset Manager</strong>
            <small>Hardware Inventory</small>
          </span>
        </Link>

        <nav className="nav-list" aria-label="Primary navigation">
          {navItems.map((item) => (
            <Link
              key={item.path}
              className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
              to={item.path}
            >
              <Icon name={item.icon} />
              <span>{item.label}</span>
            </Link>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div className="user-pill">
            <span className="avatar">{user?.email?.[0]?.toUpperCase() || 'U'}</span>
            <span>
              <strong>{user?.employee_details?.name || user?.email || 'Signed in'}</strong>
              <small>{user?.is_superuser ? 'Administrator' : 'Employee'}</small>
            </span>
          </div>
          <button className="button ghost full" type="button" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </aside>

      <main className="workspace">
        <Routes>
          <Route path="/" element={<Dashboard api={api} isAdmin={user?.is_superuser} />} />
          <Route path="/inventory" element={<InventoryPage api={api} isAdmin={user?.is_superuser} />} />
          <Route path="/employees" element={<EmployeeDirectory api={api} isAdmin={user?.is_superuser} />} />
          <Route path="/requests" element={<RequestManager api={api} isAdmin={user?.is_superuser} />} />
          <Route path="/health-checks" element={<HealthChecks api={api} isAdmin={user?.is_superuser} />} />
          <Route path="/portal" element={<EmployeePortal api={api} user={user} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function PageHeader({ eyebrow, title, children }) {
  return (
    <header className="page-header">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>
      {children && <div className="header-actions">{children}</div>}
    </header>
  );
}

function StatCard({ label, value, tone = 'neutral' }) {
  return (
    <section className={`stat-card ${tone}`}>
      <span>{label}</span>
      <strong>{value ?? 0}</strong>
    </section>
  );
}

function Dashboard({ api, isAdmin }) {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/reports/summary/')
      .then((res) => setSummary(res.data))
      .catch(() => setError('Unable to load dashboard summary.'));
  }, [api]);

  return (
    <>
      <PageHeader eyebrow={isAdmin ? 'Admin Dashboard' : 'Employee Dashboard'} title="Birds-eye inventory view" />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="stat-grid">
        <StatCard label="Total Devices" value={summary?.total_devices} tone="blue" />
        <StatCard label="Laptops" value={summary?.laptops} />
        <StatCard label="Mobiles" value={summary?.mobiles} />
        <StatCard label="Accessories" value={summary?.accessories} />
        <StatCard label="Active Requests" value={summary?.active_requests} tone="amber" />
        <StatCard label="Pending Health Checks" value={summary?.pending_health_checks} tone="red" />
      </div>

      <div className="two-column">
        <section className="panel">
          <h2>Inventory Status</h2>
          <div className="status-row"><span>Assigned</span><strong>{summary?.assigned || 0}</strong></div>
          <div className="status-row"><span>Available</span><strong>{summary?.available || 0}</strong></div>
          <div className="status-row"><span>Repair</span><strong>{summary?.repair || 0}</strong></div>
        </section>
        <section className="panel">
          <h2>Device Mix</h2>
          <div className="mini-list">
            {(summary?.category_breakdown || []).map((row) => (
              <div className="status-row" key={row.category || 'Uncategorized'}>
                <span>{row.category || 'Uncategorized'}</span>
                <strong>{row.count}</strong>
              </div>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}

function InventoryPage({ api, isAdmin }) {
  const [assets, setAssets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(emptyAsset);
  const [editingId, setEditingId] = useState(null);
  const [notice, setNotice] = useState('');

  const loadAssets = () => {
    fetchAll(api, `/assets/?page_size=100${search ? `&search=${encodeURIComponent(search)}` : ''}`)
      .then(setAssets)
      .catch(() => setNotice('Unable to load hardware inventory.'));
  };

  useEffect(() => {
    loadAssets();
  }, [api, search]);

  useEffect(() => {
    fetchAll(api, '/employees/').then(setEmployees);
  }, [api]);

  const submitAsset = async (event) => {
    event.preventDefault();
    const payload = {
      ...form,
      custodian: form.custodian || null,
      current_status: form.custodian ? 'ASSIGNED' : form.current_status,
    };
    try {
      if (editingId) {
        await api.patch(`/assets/${editingId}/`, payload);
        setNotice('Hardware updated.');
      } else {
        await api.post('/assets/', payload);
        setNotice(isAdmin ? 'Hardware added.' : 'Add hardware request submitted.');
      }
      setForm(emptyAsset);
      setEditingId(null);
      loadAssets();
    } catch (err) {
      setNotice(err.response?.data?.error || 'Unable to save hardware.');
    }
  };

  const editAsset = (asset) => {
    setEditingId(asset.id);
    setForm({
      miczon_id: asset.miczon_id || '',
      name: asset.name || '',
      category: asset.category || 'Laptop',
      current_status: asset.current_status || 'AVAILABLE',
      custodian: asset.custodian || '',
      specifications: asset.specifications || '',
    });
  };

  const removeAsset = async (asset) => {
    if (!window.confirm(`Remove ${asset.name}?`)) return;
    await api.delete(`/assets/${asset.id}/`);
    loadAssets();
  };

  return (
    <>
      <PageHeader eyebrow="Inventory Management" title="Hardware register">
        <input className="search" placeholder="Search serial, device, user..." value={search} onChange={(e) => setSearch(e.target.value)} />
      </PageHeader>
      {notice && <Notice>{notice}</Notice>}
      <section className="panel">
        <h2>{editingId ? 'Edit Hardware' : 'Add Hardware'}</h2>
        <form className="form-grid" onSubmit={submitAsset}>
          <Field label="Serial Number">
            <input required value={form.miczon_id} onChange={(e) => setForm({ ...form, miczon_id: e.target.value })} />
          </Field>
          <Field label="Device Name">
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="Device Type">
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
              <option>Laptop</option>
              <option>Mobile</option>
              <option>Accessory</option>
              <option>Monitor</option>
              <option>Printer</option>
            </select>
          </Field>
          <Field label="Status">
            <select value={form.current_status} onChange={(e) => setForm({ ...form, current_status: e.target.value })}>
              <option value="AVAILABLE">Available</option>
              <option value="ASSIGNED">Assigned</option>
              <option value="BROKEN">Repair</option>
            </select>
          </Field>
          <Field label="Assigned User">
            <select value={form.custodian || ''} onChange={(e) => setForm({ ...form, custodian: e.target.value })}>
              <option value="">Unassigned</option>
              {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
            </select>
          </Field>
          <Field label="Specifications">
            <input value={form.specifications} onChange={(e) => setForm({ ...form, specifications: e.target.value })} />
          </Field>
          <button className="button primary" type="submit">{editingId ? 'Save Changes' : 'Add Hardware'}</button>
          {editingId && <button className="button ghost" type="button" onClick={() => { setEditingId(null); setForm(emptyAsset); }}>Cancel</button>}
        </form>
      </section>

      <section className="panel">
        <h2>All Hardware</h2>
        <DataTable
          columns={['Device Type', 'Serial Number', 'Status', 'Assigned User', 'Actions']}
          rows={assets.map((asset) => [
            asset.category || 'Hardware',
            asset.miczon_id,
            <StatusBadge status={asset.current_status} />,
            asset.custodian_name || 'Available',
            <div className="row-actions">
              <button className="button small" type="button" onClick={() => editAsset(asset)}>Edit</button>
              {isAdmin && <button className="button small danger" type="button" onClick={() => removeAsset(asset)}>Remove</button>}
            </div>,
          ])}
        />
      </section>
    </>
  );
}

function EmployeeDirectory({ api, isAdmin }) {
  const [employees, setEmployees] = useState([]);
  const [selected, setSelected] = useState(null);
  const [assets, setAssets] = useState([]);
  const [notice, setNotice] = useState('');

  const loadEmployees = () => fetchAll(api, '/employees/').then(setEmployees);

  useEffect(() => {
    loadEmployees();
  }, [api]);

  const openEmployee = async (employee) => {
    setSelected(employee);
    const res = await api.get(`/employees/${employee.id}/assigned-assets/`);
    setAssets(res.data);
  };

  const unassignAll = async () => {
    if (!selected || !window.confirm(`Unassign all hardware from ${selected.name}?`)) return;
    const res = await api.post(`/employees/${selected.id}/unassign-all/`);
    setNotice(`${res.data.returned_count} hardware item(s) moved back to available.`);
    openEmployee(selected);
    loadEmployees();
  };

  return (
    <>
      <PageHeader eyebrow="Employee Directory" title="People and assigned gear" />
      {notice && <Notice>{notice}</Notice>}
      <div className="two-column wide-left">
        <section className="panel">
          <h2>Employees</h2>
          <div className="employee-list">
            {employees.map((employee) => (
              <button className={`employee-row ${selected?.id === employee.id ? 'active' : ''}`} key={employee.id} type="button" onClick={() => openEmployee(employee)}>
                <span>
                  <strong>{employee.name}</strong>
                  <small>{employee.employee_id} · {employee.department_name || 'No department'}</small>
                </span>
                <b>{employee.assigned_assets_count || 0}</b>
              </button>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>{selected ? selected.name : 'Select an employee'}</h2>
            {isAdmin && selected && <button className="button danger" type="button" onClick={unassignAll}>Unassign All</button>}
          </div>
          <DataTable
            columns={['Device', 'Serial', 'Type', 'Status']}
            rows={assets.map((asset) => [asset.name, asset.miczon_id, asset.category, <StatusBadge status={asset.current_status} />])}
            empty="No hardware assigned."
          />
        </section>
      </div>
    </>
  );
}

function RequestManager({ api, isAdmin }) {
  const [requests, setRequests] = useState([]);
  const [notice, setNotice] = useState('');
  const loadRequests = () => fetchAll(api, '/requests/').then(setRequests);

  useEffect(() => {
    loadRequests();
  }, [api]);

  const processRequest = async (id, action) => {
    await api.post(`/requests/${id}/${action}/`, { admin_remarks: action === 'approve' ? 'Approved from request manager.' : 'Denied from request manager.' });
    setNotice(`Request ${action === 'approve' ? 'approved' : 'denied'}.`);
    loadRequests();
  };

  return (
    <>
      <PageHeader eyebrow="Request Manager" title="Review hardware requests" />
      {notice && <Notice>{notice}</Notice>}
      <section className="panel">
        <DataTable
          columns={['Requester', 'Device', 'Reason', 'Status', 'Created', 'Actions']}
          rows={requests.map((request) => [
            request.requester_name,
            request.asset_name || request.requested_device_type || request.asset_miczon_id || 'New hardware',
            request.remarks || 'No reason provided',
            <StatusBadge status={request.status} />,
            new Date(request.created_at).toLocaleDateString(),
            isAdmin && request.status === 'PENDING' ? (
              <div className="row-actions">
                <button className="button small primary" type="button" onClick={() => processRequest(request.id, 'approve')}>Approve</button>
                <button className="button small danger" type="button" onClick={() => processRequest(request.id, 'reject')}>Deny</button>
              </div>
            ) : 'Reviewed',
          ])}
          empty="No requests yet."
        />
      </section>
    </>
  );
}

function HealthChecks({ api, isAdmin }) {
  const [sessions, setSessions] = useState([]);
  const [responses, setResponses] = useState([]);
  const [notice, setNotice] = useState('');

  const load = () => {
    fetchAll(api, '/health-checks/').then(setSessions);
    fetchAll(api, '/health-responses/').then(setResponses);
  };

  useEffect(() => {
    load();
  }, [api]);

  const trigger = async () => {
    const res = await api.post('/health-checks/trigger-global/');
    setNotice(`Global health check triggered for ${res.data.assigned_assets} assigned hardware item(s).`);
    load();
  };

  return (
    <>
      <PageHeader eyebrow="Health Check Responses" title="Hardware health trail">
        {isAdmin && <button className="button primary" type="button" onClick={trigger}>Trigger Global Health Check</button>}
      </PageHeader>
      {notice && <Notice>{notice}</Notice>}
      <div className="two-column">
        <section className="panel">
          <h2>Sessions</h2>
          <DataTable
            columns={['Title', 'Status', 'Responses', 'Created']}
            rows={sessions.map((session) => [
              session.title,
              <StatusBadge status={session.status} />,
              session.response_count || 0,
              new Date(session.created_at).toLocaleDateString(),
            ])}
            empty="No health checks triggered."
          />
        </section>
        <section className="panel">
          <h2>Health Trail</h2>
          <DataTable
            columns={['Asset', 'Employee', 'Screen', 'Battery', 'Rating']}
            rows={responses.map((response) => [
              `${response.asset_name} (${response.asset_miczon_id})`,
              response.employee_name,
              response.screen_condition,
              response.battery_life,
              `${response.performance_rating}/5`,
            ])}
            empty="No responses yet."
          />
        </section>
      </div>
    </>
  );
}

function EmployeePortal({ api, user }) {
  const employee = user?.employee_details;
  const [gear, setGear] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [pendingAssets, setPendingAssets] = useState([]);
  const [activeSession, setActiveSession] = useState('');
  const [requestForm, setRequestForm] = useState({ requested_device_type: 'Laptop', remarks: '' });
  const [healthForm, setHealthForm] = useState({});
  const [notice, setNotice] = useState('');

  const loadPortal = async () => {
    if (!employee?.id) return;
    const gearRes = await api.get(`/employees/${employee.id}/assigned-assets/`);
    const openSessions = (await fetchAll(api, '/health-checks/')).filter((session) => session.status === 'OPEN');
    setGear(gearRes.data);
    setSessions(openSessions);
    const firstSession = activeSession || openSessions[0]?.id || '';
    setActiveSession(firstSession);
    if (firstSession) {
      const pendingRes = await api.get(`/health-checks/${firstSession}/pending-assets/`);
      setPendingAssets(pendingRes.data);
    } else {
      setPendingAssets([]);
    }
  };

  useEffect(() => {
    loadPortal();
  }, [api, employee?.id]);

  useEffect(() => {
    if (!activeSession) return;
    api.get(`/health-checks/${activeSession}/pending-assets/`).then((res) => setPendingAssets(res.data));
  }, [api, activeSession]);

  const submitRequest = async (event) => {
    event.preventDefault();
    await api.post('/requests/', {
      action_type: 'ASSIGN',
      requested_device_type: requestForm.requested_device_type,
      remarks: requestForm.remarks,
    });
    setNotice('Hardware request submitted.');
    setRequestForm({ requested_device_type: 'Laptop', remarks: '' });
  };

  const submitHealth = async (event, assetId) => {
    event.preventDefault();
    const values = healthForm[assetId] || {};
    await api.post('/health-responses/', {
      session: activeSession,
      asset: assetId,
      screen_condition: values.screen_condition || 'GOOD',
      battery_life: values.battery_life || 'GOOD',
      performance_rating: values.performance_rating || 4,
      comments: values.comments || '',
    });
    setNotice('Health check response saved.');
    loadPortal();
  };

  return (
    <>
      <PageHeader eyebrow="Employee Portal" title="My gear and requests" />
      {!employee && (
        <Notice tone="error">
          Your login is not linked to an employee profile yet. Ask an admin to link your user to an employee record before using My Gear, requests, or health checks.
        </Notice>
      )}
      {notice && <Notice>{notice}</Notice>}
      <div className="two-column">
        <section className="panel">
          <h2>My Gear</h2>
          <DataTable
            columns={['Device', 'Serial', 'Type', 'Status']}
            rows={gear.map((asset) => [asset.name, asset.miczon_id, asset.category, <StatusBadge status={asset.current_status} />])}
            empty="No hardware assigned."
          />
        </section>
        <section className="panel">
          <h2>New Request</h2>
          <form className="stack-form" onSubmit={submitRequest}>
            <Field label="Hardware Type">
              <select value={requestForm.requested_device_type} onChange={(e) => setRequestForm({ ...requestForm, requested_device_type: e.target.value })}>
                <option>Laptop</option>
                <option>Mobile</option>
                <option>Accessory</option>
                <option>Monitor</option>
                <option>Other</option>
              </select>
            </Field>
            <Field label="Reason for Request">
              <textarea required rows="4" value={requestForm.remarks} onChange={(e) => setRequestForm({ ...requestForm, remarks: e.target.value })} />
            </Field>
            <button className="button primary" type="submit" disabled={!employee}>Submit Request</button>
          </form>
        </section>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <h2>Health Check Responses</h2>
          {sessions.length > 0 && (
            <select className="compact-select" value={activeSession} onChange={(e) => setActiveSession(e.target.value)}>
              {sessions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}
            </select>
          )}
        </div>
        <div className="health-grid">
          {pendingAssets.length === 0 && <p className="empty-state">No pending health check forms.</p>}
          {pendingAssets.map((asset) => {
            const values = healthForm[asset.id] || {};
            return (
              <form className="health-card" key={asset.id} onSubmit={(event) => submitHealth(event, asset.id)}>
                <h3>{asset.name}</h3>
                <p>{asset.miczon_id} · {asset.category}</p>
                <Field label="Screen condition">
                  <select value={values.screen_condition || 'GOOD'} onChange={(e) => setHealthForm({ ...healthForm, [asset.id]: { ...values, screen_condition: e.target.value } })}>
                    <option value="EXCELLENT">Excellent</option>
                    <option value="GOOD">Good</option>
                    <option value="SCRATCHED">Scratched</option>
                    <option value="CRACKED">Cracked</option>
                    <option value="NEEDS_REPAIR">Needs Repair</option>
                  </select>
                </Field>
                <Field label="Battery life">
                  <select value={values.battery_life || 'GOOD'} onChange={(e) => setHealthForm({ ...healthForm, [asset.id]: { ...values, battery_life: e.target.value } })}>
                    <option value="EXCELLENT">Excellent</option>
                    <option value="GOOD">Good</option>
                    <option value="FAIR">Fair</option>
                    <option value="POOR">Poor</option>
                    <option value="NOT_APPLICABLE">Not Applicable</option>
                  </select>
                </Field>
                <Field label="Overall performance rating">
                  <input min="1" max="5" type="number" value={values.performance_rating || 4} onChange={(e) => setHealthForm({ ...healthForm, [asset.id]: { ...values, performance_rating: e.target.value } })} />
                </Field>
                <Field label="Comments">
                  <textarea rows="3" value={values.comments || ''} onChange={(e) => setHealthForm({ ...healthForm, [asset.id]: { ...values, comments: e.target.value } })} />
                </Field>
                <button className="button primary" type="submit">Save Response</button>
              </form>
            );
          })}
        </div>
      </section>
    </>
  );
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function Notice({ children, tone = 'success' }) {
  return <div className={`notice ${tone}`}>{children}</div>;
}

function StatusBadge({ status }) {
  const label = String(status || 'Unknown').replaceAll('_', ' ').toLowerCase();
  return <span className={`status-badge ${String(status || '').toLowerCase()}`}>{label}</span>;
}

function DataTable({ columns, rows, empty = 'No records found.' }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length} className="empty-state">{empty}</td></tr>
          ) : rows.map((row, index) => (
            <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function App() {
  const getInitialToken = () => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const urlUserId = params.get('user_id');
    if (urlToken) {
      localStorage.setItem('userToken', urlToken);
      if (urlUserId) localStorage.setItem('userId', urlUserId);
      window.history.replaceState({}, document.title, window.location.pathname);
      return urlToken;
    }
    return localStorage.getItem('userToken');
  };

  const [token, setToken] = useState(getInitialToken);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!token);

  const handleLogout = () => {
    localStorage.removeItem('userToken');
    setToken(null);
    setUser(null);
  };

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    axios.get(`${API_BASE}/auth/current-user/`, {
      headers: { Authorization: `Token ${token}` },
    }).then((res) => {
      setUser(res.data);
    }).catch(() => {
      handleLogout();
    }).finally(() => {
      setLoading(false);
    });
  }, [token]);

  if (loading) return <div className="loading-screen">Loading workspace...</div>;

  return (
    <UserContext.Provider value={{ user, setUser, loading, token }}>
      <BrowserRouter>
        {!token ? (
          <Routes>
            <Route path="/login" element={<Login setToken={setToken} />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        ) : (
          <AppShell token={token} handleLogout={handleLogout} />
        )}
      </BrowserRouter>
    </UserContext.Provider>
  );
}

export default App;
