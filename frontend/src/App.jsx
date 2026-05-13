/* eslint-disable react-refresh/only-export-components, react-hooks/set-state-in-effect */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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
  category: '',
  department: '',
  current_status: 'AVAILABLE',
  custodian: '',
  specifications: '',
  remarks: '',
};

const emptyEmployee = {
  name: '',
  employee_id: '',
  email: '',
  department: '',
};

const assetStatuses = [
  { value: 'ASSIGNED', label: 'Assigned' },
  { value: 'AVAILABLE', label: 'Available' },
  { value: 'BROKEN', label: 'Repair' },
  { value: 'RETIRED', label: 'Retired' },
];

const inventoryPageSize = 25;

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
            <strong>AssetZone</strong>
            <small>Hardware Inventory</small>
          </span>
        </Link>

        <nav className="nav-list" aria-label="Primary navigation">
          {navItems.map((item) => (
            <Link key={item.path} className={`nav-item ${location.pathname === item.path ? 'active' : ''}`} to={item.path}>
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
          <Button type="button" variant="ghost" className="full" onClick={handleLogout}>Sign out</Button>
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

function Button({ variant = 'default', size = 'default', className = '', ...props }) {
  return <button className={`button button-${variant} button-${size} ${className}`.trim()} {...props} />;
}

function Select({ className = '', ...props }) {
  return <select className={`select ${className}`.trim()} {...props} />;
}

function Dialog({ open, children }) {
  if (!open) return null;
  return <div className="dialog-root">{children}</div>;
}

function DialogContent({ className = '', children }) {
  return (
    <div className="dialog-overlay">
      <div className={`dialog-content ${className}`.trim()} role="dialog" aria-modal="true">
        {children}
      </div>
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

function MetricCard({ label, value, to, tone = 'slate' }) {
  return (
    <Link className="metric-card-link" to={to} aria-label={`Open ${label}`}>
      <section className={`metric-card ${tone}`}>
        <span>{label}</span>
        <strong>{value ?? 0}</strong>
      </section>
    </Link>
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

  const metrics = [
    { label: 'Total Devices', value: summary?.total_devices, to: '/inventory', tone: 'blue' },
    { label: 'Assigned Devices', value: summary?.assigned, to: '/inventory?status=ASSIGNED', tone: 'green' },
    { label: 'Unassigned Devices', value: summary?.available, to: '/inventory?status=AVAILABLE', tone: 'slate' },
    { label: 'Repair Devices', value: summary?.repair, to: '/inventory?status=BROKEN', tone: 'red' },
    { label: 'Active Requests', value: summary?.active_requests, to: '/requests', tone: 'amber' },
    { label: 'Pending Health Checks', value: summary?.pending_health_checks, to: '/health-checks', tone: 'violet' },
  ];

  return (
    <>
      <PageHeader eyebrow={isAdmin ? 'Admin Dashboard' : 'Employee Dashboard'} title="Birds-eye inventory view" />
      {error && <Notice tone="error">{error}</Notice>}
      <div className="metric-grid">
        {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </div>
    </>
  );
}

function InventoryPage({ api, isAdmin }) {
  const location = useLocation();
  const [assets, setAssets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(new URLSearchParams(location.search).get('status') || '');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyAsset);
  const [editingId, setEditingId] = useState(null);
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setStatusFilter(new URLSearchParams(location.search).get('status') || '');
  }, [location.search]);

  const loadAssets = useCallback(() => {
    const params = new URLSearchParams({ page_size: String(inventoryPageSize) });
    if (search) params.set('search', search);
    if (statusFilter) params.set('status', statusFilter);
    if (departmentFilter) params.set('department', departmentFilter);

    return api.get(`/assets/?${params.toString()}`)
      .then((res) => setAssets(normalizeList(res.data)))
      .catch(() => setNotice('Unable to load hardware inventory.'));
  }, [api, search, statusFilter, departmentFilter]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    fetchAll(api, '/employees/').then(setEmployees);
    fetchAll(api, '/departments/').then(setDepartments);
  }, [api]);

  const closeAssetDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyAsset);
  };

  const submitAsset = async (event) => {
    event.preventDefault();
    const payload = {
      ...form,
      custodian: form.custodian || null,
      department: form.department || null,
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
      closeAssetDialog();
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
      category: asset.category || '',
      department: asset.department || '',
      current_status: asset.current_status || 'AVAILABLE',
      custodian: asset.custodian || '',
      specifications: asset.specifications || '',
      remarks: asset.remarks || '',
    });
    setDialogOpen(true);
  };

  const removeAsset = async (asset) => {
    if (!window.confirm(`Remove ${asset.name}?`)) return;
    await api.delete(`/assets/${asset.id}/`);
    loadAssets();
  };

  return (
    <>
      <PageHeader eyebrow="Inventory Management" title="Hardware register">
        <Button type="button" variant="primary" onClick={() => setDialogOpen(true)}>Add Asset</Button>
      </PageHeader>
      {notice && <Notice>{notice}</Notice>}

      <section className="panel">
        <div className="panel-heading inventory-heading">
          <div>
            <h2>All Hardware</h2>
            <p className="panel-subtitle">{assets.length} item{assets.length === 1 ? '' : 's'} loaded</p>
          </div>
        </div>
        <div className="filter-bar">
          <input className="search" placeholder="Search Miczon ID, device, custodian..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
            <option value="">All Departments</option>
            {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All Statuses</option>
            {assetStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </Select>
          <Button type="button" variant="ghost" onClick={() => { setSearch(''); setDepartmentFilter(''); setStatusFilter(''); }}>Reset</Button>
        </div>
        <DataTable
          columns={['Miczon ID', 'Device', 'Category', 'Department', 'Status', 'Assigned User', 'Actions']}
          rows={assets.map((asset) => [
            asset.miczon_id,
            asset.name,
            asset.category || 'Uncategorized',
            asset.department_name || 'No department',
            <StatusBadge status={asset.current_status} />,
            asset.custodian_name || 'Unassigned',
            <div className="row-actions">
              <Button type="button" variant="outline" size="sm" onClick={() => editAsset(asset)}>Edit</Button>
              {isAdmin && <Button type="button" variant="danger" size="sm" onClick={() => removeAsset(asset)}>Remove</Button>}
            </div>,
          ])}
          empty="No assets match the current filters."
        />
      </section>

      <Dialog open={dialogOpen}>
        <DialogContent>
          <DialogHeader title={editingId ? 'Edit Asset' : 'Add Asset'} description="Register hardware with the fields used by the asset workflow." />
          <form className="dialog-form" onSubmit={submitAsset}>
            <Field label="Miczon ID"><input required value={form.miczon_id} onChange={(e) => setForm({ ...form, miczon_id: e.target.value })} /></Field>
            <Field label="Device Name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Category"><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} /></Field>
            <Field label="Department">
              <Select value={form.department || ''} onChange={(e) => setForm({ ...form, department: e.target.value })}>
                <option value="">No department</option>
                {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </Select>
            </Field>
            <Field label="Status">
              <Select value={form.current_status} onChange={(e) => setForm({ ...form, current_status: e.target.value })}>
                {assetStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
              </Select>
            </Field>
            <Field label="Assigned User">
              <Select value={form.custodian || ''} onChange={(e) => setForm({ ...form, custodian: e.target.value })}>
                <option value="">Unassigned</option>
                {employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
              </Select>
            </Field>
            <Field label="Specifications"><textarea rows="3" value={form.specifications} onChange={(e) => setForm({ ...form, specifications: e.target.value })} /></Field>
            <Field label="Remarks"><textarea rows="3" value={form.remarks} onChange={(e) => setForm({ ...form, remarks: e.target.value })} /></Field>
            <div className="dialog-footer">
              <Button type="button" variant="ghost" onClick={closeAssetDialog}>Cancel</Button>
              <Button type="submit" variant="primary">{editingId ? 'Save Changes' : 'Add Asset'}</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function EmployeeDirectory({ api, isAdmin }) {
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [employeeDialogOpen, setEmployeeDialogOpen] = useState(false);
  const [employeeForm, setEmployeeForm] = useState(emptyEmployee);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [assets, setAssets] = useState([]);
  const [selectedAssetIds, setSelectedAssetIds] = useState([]);
  const [notice, setNotice] = useState('');

  const loadEmployees = useCallback(() => {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (departmentFilter) params.set('department', departmentFilter);
    return fetchAll(api, `/employees/?${params.toString()}`).then(setEmployees);
  }, [api, search, departmentFilter]);

  useEffect(() => {
    loadEmployees();
  }, [loadEmployees]);

  useEffect(() => {
    fetchAll(api, '/departments/').then(setDepartments);
  }, [api]);

  const loadEmployeeAssets = async (employee) => {
    const res = await api.get(`/employees/${employee.id}/assigned-assets/`);
    setAssets(res.data);
    setSelectedAssetIds(res.data.map((asset) => asset.id));
  };

  const openEmployee = async (employee) => {
    setSelectedEmployee(employee);
    await loadEmployeeAssets(employee);
  };

  const submitEmployee = async (event) => {
    event.preventDefault();
    try {
      await api.post('/employees/', { ...employeeForm, department: employeeForm.department || null });
      setNotice('Employee added.');
      setEmployeeForm(emptyEmployee);
      setEmployeeDialogOpen(false);
      loadEmployees();
    } catch (err) {
      setNotice(err.response?.data?.employee_id?.[0] || err.response?.data?.error || 'Unable to add employee.');
    }
  };

  const unassignSelected = async () => {
    if (!selectedEmployee || selectedAssetIds.length === 0) return;
    const res = await api.post(`/employees/${selectedEmployee.id}/unassign-all/`, { asset_ids: selectedAssetIds });
    setNotice(`${res.data.returned_count} hardware item(s) moved back to available.`);
    await loadEmployeeAssets(selectedEmployee);
    loadEmployees();
  };

  const allSelected = assets.length > 0 && selectedAssetIds.length === assets.length;

  return (
    <>
      <PageHeader eyebrow="Employee Directory" title="People and assigned gear">
        {isAdmin && <Button type="button" variant="primary" onClick={() => setEmployeeDialogOpen(true)}>Add Employee</Button>}
      </PageHeader>
      {notice && <Notice>{notice}</Notice>}
      <section className="panel">
        <div className="employee-filter-bar">
          <input className="search" placeholder="Search name or employee ID..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}>
            <option value="">All Departments</option>
            {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </Select>
          <Button type="button" variant="ghost" onClick={() => { setSearch(''); setDepartmentFilter(''); }}>Reset</Button>
        </div>
        <DataTable
          columns={['Name', 'Employee ID', 'Department', 'Email', 'Assigned Assets']}
          rows={employees.map((employee) => [
            <button className="link-button" type="button" onClick={() => openEmployee(employee)}>{employee.name}</button>,
            employee.employee_id,
            employee.department_name || 'No department',
            employee.email || 'No email',
            <strong>{employee.assigned_assets_count || 0}</strong>,
          ])}
          empty="No employees match the current filters."
        />
      </section>

      <Dialog open={!!selectedEmployee}>
        <DialogContent className="employee-assets-dialog">
          <DialogHeader title="Assets Detail" description={`${selectedEmployee?.name || ''} - ${selectedEmployee?.employee_id || ''}`} />
          <div className="modal-toolbar">
            <label className="checkbox-row">
              <input type="checkbox" checked={allSelected} disabled={assets.length === 0} onChange={() => setSelectedAssetIds(allSelected ? [] : assets.map((asset) => asset.id))} />
              <span>Select All</span>
            </label>
            {isAdmin && <Button type="button" variant="danger" disabled={selectedAssetIds.length === 0} onClick={unassignSelected}>Unassign Selected</Button>}
          </div>
          <DataTable
            columns={['Select', 'Device', 'Serial', 'Type', 'Status']}
            rows={assets.map((asset) => [
              <input type="checkbox" checked={selectedAssetIds.includes(asset.id)} onChange={() => setSelectedAssetIds((current) => current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current, asset.id])} />,
              asset.name,
              asset.miczon_id,
              asset.category || 'Uncategorized',
              <StatusBadge status={asset.current_status} />,
            ])}
            empty="No hardware assigned."
          />
          <div className="dialog-footer">
            <Button type="button" variant="ghost" onClick={() => { setSelectedEmployee(null); setAssets([]); setSelectedAssetIds([]); }}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={employeeDialogOpen}>
        <DialogContent>
          <DialogHeader title="Add Employee" description="Create an employee record so hardware can be assigned and tracked." />
          <form className="dialog-form" onSubmit={submitEmployee}>
            <Field label="Employee Name"><input required value={employeeForm.name} onChange={(e) => setEmployeeForm({ ...employeeForm, name: e.target.value })} /></Field>
            <Field label="Employee ID"><input required value={employeeForm.employee_id} onChange={(e) => setEmployeeForm({ ...employeeForm, employee_id: e.target.value })} /></Field>
            <Field label="Email"><input type="email" value={employeeForm.email} onChange={(e) => setEmployeeForm({ ...employeeForm, email: e.target.value })} /></Field>
            <Field label="Department">
              <Select value={employeeForm.department} onChange={(e) => setEmployeeForm({ ...employeeForm, department: e.target.value })}>
                <option value="">No department</option>
                {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
              </Select>
            </Field>
            <div className="dialog-footer">
              <Button type="button" variant="ghost" onClick={() => setEmployeeDialogOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Add Employee</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function RequestManager({ api, isAdmin }) {
  const [requests, setRequests] = useState([]);
  const [notice, setNotice] = useState('');
  const loadRequests = useCallback(() => fetchAll(api, '/requests/').then(setRequests), [api]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

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
            request.reason_for_request || request.remarks || 'No reason provided',
            <StatusBadge status={request.status} />,
            new Date(request.created_at).toLocaleDateString(),
            isAdmin && request.status === 'PENDING' ? (
              <div className="row-actions">
                <Button type="button" variant="primary" size="sm" onClick={() => processRequest(request.id, 'approve')}>Approve</Button>
                <Button type="button" variant="danger" size="sm" onClick={() => processRequest(request.id, 'reject')}>Deny</Button>
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

  const load = useCallback(() => {
    fetchAll(api, '/health-checks/').then(setSessions);
    fetchAll(api, '/health-responses/').then(setResponses);
  }, [api]);

  useEffect(() => {
    load();
  }, [load]);

  const trigger = async () => {
    const res = await api.post('/health-checks/trigger-global/');
    setNotice(`Global health check triggered for ${res.data.assigned_assets || res.data.target_assets || 0} hardware item(s).`);
    load();
  };

  return (
    <>
      <PageHeader eyebrow="Health Check Responses" title="Hardware health trail">
        {isAdmin && <Button type="button" variant="primary" onClick={trigger}>Trigger Global Health Check</Button>}
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
  const [requestDialogOpen, setRequestDialogOpen] = useState(false);
  const [requestForm, setRequestForm] = useState({ requested_device_type: 'Laptop', remarks: '' });
  const [healthForm, setHealthForm] = useState({});
  const [notice, setNotice] = useState('');

  const loadPortal = useCallback(async () => {
    if (!employee?.id) return;
    const gearRes = await api.get(`/employees/${employee.id}/assigned-assets/`);
    const openSessions = (await fetchAll(api, '/health-checks/')).filter((session) => session.status === 'OPEN');
    setGear(gearRes.data);
    setSessions(openSessions);
    const firstSession = openSessions.some((session) => String(session.id) === String(activeSession)) ? activeSession : openSessions[0]?.id || '';
    setActiveSession(firstSession);
    if (firstSession) {
      const pendingRes = await api.get(`/health-checks/${firstSession}/pending-assets/`);
      setPendingAssets(pendingRes.data);
    } else {
      setPendingAssets([]);
    }
  }, [api, employee, activeSession]);

  useEffect(() => {
    loadPortal();
  }, [loadPortal]);

  useEffect(() => {
    if (!activeSession) return;
    api.get(`/health-checks/${activeSession}/pending-assets/`).then((res) => setPendingAssets(res.data));
  }, [api, activeSession]);

  const submitRequest = async (event) => {
    event.preventDefault();
    try {
      await api.post('/requests/', {
        action_type: 'ASSIGN',
        requested_device_type: requestForm.requested_device_type,
        reason_for_request: requestForm.remarks,
        remarks: requestForm.remarks,
      });
      setNotice('Hardware request submitted.');
      setRequestForm({ requested_device_type: 'Laptop', remarks: '' });
      setRequestDialogOpen(false);
    } catch (err) {
      setNotice(err.response?.data?.error || 'Unable to submit hardware request.');
    }
  };

  const submitHealth = async (event, assetId) => {
    event.preventDefault();
    const values = healthForm[assetId] || {};
    try {
      await api.post('/health-responses/', {
        session: activeSession,
        asset: assetId,
        screen_condition: values.screen_condition || 'GOOD',
        battery_life: values.battery_life || 'GOOD',
        performance_rating: values.performance_rating || 4,
        comments: values.comments || '',
      });
      setNotice('Health check response saved.');
      setHealthForm((current) => {
        const next = { ...current };
        delete next[assetId];
        return next;
      });
      loadPortal();
    } catch (err) {
      setNotice(err.response?.data?.error || 'Unable to save health check response.');
    }
  };

  return (
    <>
      <PageHeader eyebrow="Employee Portal" title="My gear and requests">
        <Button type="button" variant="primary" disabled={!employee} onClick={() => setRequestDialogOpen(true)}>Request Asset</Button>
      </PageHeader>
      {!employee && <Notice tone="error">Your login is not linked to an employee profile yet. Ask an admin to link your user to an employee record before using My Gear, requests, or health checks.</Notice>}
      {employee && activeSession && pendingAssets.length > 0 && <Notice tone="error">Monthly inspection required: {pendingAssets.length} assigned item{pendingAssets.length === 1 ? '' : 's'} still need a health check.</Notice>}
      {notice && <Notice>{notice}</Notice>}

      <section className="panel portal-gear-panel">
        <div className="panel-heading inventory-heading">
          <div>
            <h2>My Gear</h2>
            <p className="panel-subtitle">{gear.length} assigned item{gear.length === 1 ? '' : 's'}</p>
          </div>
          {activeSession && <StatusBadge status="Inspection Open" />}
        </div>
        {gear.length === 0 ? (
          <p className="empty-state">No hardware assigned.</p>
        ) : (
          <div className="gear-list">
            {gear.map((asset) => {
              const needsInspection = pendingAssets.some((pendingAsset) => pendingAsset.id === asset.id);
              return (
                <article className={`gear-row ${needsInspection ? 'needs-inspection' : ''}`} key={asset.id}>
                  <div className="gear-main">
                    <strong>{asset.name}</strong>
                    <small>{asset.miczon_id} - {asset.category || 'Uncategorized'}</small>
                  </div>
                  <div className="gear-meta">
                    <span>{asset.department_name || 'No department'}</span>
                    <StatusBadge status={needsInspection ? 'Inspection Due' : asset.current_status} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <h2>Health Check Responses</h2>
          {sessions.length > 0 && (
            <Select className="compact-select" value={activeSession} onChange={(e) => setActiveSession(e.target.value)}>
              {sessions.map((session) => <option key={session.id} value={session.id}>{session.title}</option>)}
            </Select>
          )}
        </div>
        <div className="health-grid">
          {pendingAssets.length === 0 && <p className="empty-state">No pending health check forms.</p>}
          {pendingAssets.map((asset) => {
            const values = healthForm[asset.id] || {};
            return (
              <form className="health-card" key={asset.id} onSubmit={(event) => submitHealth(event, asset.id)}>
                <h3>{asset.name}</h3>
                <p>{asset.miczon_id} - {asset.category}</p>
                <Field label="Screen condition">
                  <Select value={values.screen_condition || 'GOOD'} onChange={(e) => setHealthForm({ ...healthForm, [asset.id]: { ...values, screen_condition: e.target.value } })}>
                    <option value="EXCELLENT">Excellent</option>
                    <option value="GOOD">Good</option>
                    <option value="SCRATCHED">Scratched</option>
                    <option value="CRACKED">Cracked</option>
                    <option value="NEEDS_REPAIR">Needs Repair</option>
                  </Select>
                </Field>
                <Field label="Battery life">
                  <Select value={values.battery_life || 'GOOD'} onChange={(e) => setHealthForm({ ...healthForm, [asset.id]: { ...values, battery_life: e.target.value } })}>
                    <option value="EXCELLENT">Excellent</option>
                    <option value="GOOD">Good</option>
                    <option value="FAIR">Fair</option>
                    <option value="POOR">Poor</option>
                    <option value="NOT_APPLICABLE">Not Applicable</option>
                  </Select>
                </Field>
                <Field label="Overall performance rating"><input min="1" max="5" type="number" value={values.performance_rating || 4} onChange={(e) => setHealthForm({ ...healthForm, [asset.id]: { ...values, performance_rating: e.target.value } })} /></Field>
                <Field label="Comments"><textarea rows="3" value={values.comments || ''} onChange={(e) => setHealthForm({ ...healthForm, [asset.id]: { ...values, comments: e.target.value } })} /></Field>
                <Button type="submit" variant="primary">Save Response</Button>
              </form>
            );
          })}
        </div>
      </section>

      <Dialog open={requestDialogOpen}>
        <DialogContent>
          <DialogHeader title="Request Asset" description="Submit a hardware request for IT review." />
          <form className="dialog-form single-column" onSubmit={submitRequest}>
            <Field label="Hardware Type">
              <Select value={requestForm.requested_device_type} onChange={(e) => setRequestForm({ ...requestForm, requested_device_type: e.target.value })}>
                <option>Laptop</option>
                <option>Mobile</option>
                <option>Accessory</option>
                <option>Monitor</option>
                <option>Other</option>
              </Select>
            </Field>
            <Field label="Reason for Request"><textarea required rows="5" value={requestForm.remarks} onChange={(e) => setRequestForm({ ...requestForm, remarks: e.target.value })} /></Field>
            <div className="dialog-footer">
              <Button type="button" variant="ghost" onClick={() => setRequestDialogOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={!employee}>Submit Request</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function DialogHeader({ title, description }) {
  return (
    <div className="dialog-header">
      <h2 className="dialog-title">{title}</h2>
      {description && <p className="dialog-description">{description}</p>}
    </div>
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
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
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

  const handleLogout = useCallback(() => {
    localStorage.removeItem('userToken');
    setToken(null);
    setUser(null);
  }, []);

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
  }, [token, handleLogout]);

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
