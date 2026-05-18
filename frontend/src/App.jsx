/* eslint-disable react-refresh/only-export-components, react-hooks/set-state-in-effect */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { BrowserRouter, Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
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

const healthInspectionFields = [
  {
    name: 'screen_condition',
    label: 'Screen condition',
    defaultValue: 'GOOD',
    options: [
      { value: 'EXCELLENT', label: 'Excellent' },
      { value: 'GOOD', label: 'Good' },
      { value: 'SCRATCHED', label: 'Scratched' },
      { value: 'CRACKED', label: 'Cracked' },
      { value: 'NEEDS_REPAIR', label: 'Needs Repair' },
      { value: 'NOT_APPLICABLE', label: 'Not Applicable (N/A)' },
    ],
  },
  {
    name: 'battery_life',
    label: 'Battery life',
    defaultValue: 'GOOD',
    options: [
      { value: 'EXCELLENT', label: 'Excellent' },
      { value: 'GOOD', label: 'Good' },
      { value: 'FAIR', label: 'Fair' },
      { value: 'POOR', label: 'Poor' },
      { value: 'NOT_APPLICABLE', label: 'Not Applicable (N/A)' },
    ],
  },
  {
    name: 'physical_condition',
    label: 'Physical Condition',
    defaultValue: 'GOOD_MINOR_WEAR',
    options: [
      { value: 'EXCELLENT', label: 'Excellent' },
      { value: 'GOOD_MINOR_WEAR', label: 'Good (Minor wear)' },
      { value: 'FAIR_SCRATCHES_DENTS', label: 'Fair (Noticeable scratches/dents)' },
      { value: 'POOR_CRACKED_BROKEN', label: 'Poor (Cracked/Broken)' },
    ],
  },
  {
    name: 'power_boot_status',
    label: 'Power & Boot Status',
    defaultValue: 'BOOTS_NORMALLY',
    options: [
      { value: 'BOOTS_NORMALLY', label: 'Boots normally' },
      { value: 'SLOW_TO_BOOT', label: 'Slow to boot' },
      { value: 'POWERS_NO_DISPLAY_OS', label: 'Powers on but no display/OS' },
      { value: 'DOES_NOT_POWER_ON', label: 'Does not power on' },
    ],
  },
  {
    name: 'ports_connectors',
    label: 'Ports & Connectors',
    defaultValue: 'ALL_FUNCTIONAL',
    options: [
      { value: 'ALL_FUNCTIONAL', label: 'All functional' },
      { value: 'LOOSE_CONNECTIONS', label: 'Loose connections' },
      { value: 'VISIBLY_DAMAGED', label: 'Visibly damaged' },
      { value: 'UNRESPONSIVE', label: 'Unresponsive' },
    ],
  },
  {
    name: 'network_functionality',
    label: 'Network Functionality',
    defaultValue: 'CONNECTS_NORMALLY',
    options: [
      { value: 'CONNECTS_NORMALLY', label: 'Connects normally' },
      { value: 'INTERMITTENT_CONNECTION', label: 'Intermittent connection' },
      { value: 'FAILS_TO_CONNECT', label: 'Fails to connect' },
    ],
  },
  {
    name: 'asset_tag_status',
    label: 'Asset Tag Status',
    defaultValue: 'INTACT_SCANNABLE',
    options: [
      { value: 'INTACT_SCANNABLE', label: 'Intact & Scannable' },
      { value: 'FADED_PEELING', label: 'Faded/Peeling' },
      { value: 'MISSING', label: 'Missing' },
    ],
  },
];

const ratingOptions = [1, 2, 3, 4, 5];

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

function getQrPayload(miczonId) {
  return `${window.location.origin}/scan/${encodeURIComponent(miczonId || '')}`;
}

function extractMiczonIdFromScan(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';

  try {
    const parsed = new URL(rawValue);
    const scanIndex = parsed.pathname.split('/').filter(Boolean).findIndex((part) => part.toLowerCase() === 'scan');
    if (scanIndex >= 0) {
      return decodeURIComponent(parsed.pathname.split('/').filter(Boolean)[scanIndex + 1] || '');
    }
  } catch {
    // Plain Miczon IDs are also accepted for manual testing and fallback scanners.
  }

  return rawValue.replace(/^.*\/scan\//i, '').trim();
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
        <Link className="brand" to={user?.is_superuser ? '/' : '/portal'}>
          <span className="brand-mark">IT</span>
          <span>
            <strong>AssetZone</strong>
            <small>Hardware Inventory</small>
          </span>
        </Link>

        <nav className="nav-list" aria-label="Primary navigation">
          {navItems.filter(item => user?.is_superuser || item.path === '/portal').map((item) => (
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
        {user?.is_superuser ? (
          <Routes>
            <Route path="/" element={<Dashboard api={api} isAdmin={true} />} />
            <Route path="/inventory" element={<InventoryPage api={api} isAdmin={true} />} />
            <Route path="/inventory/add" element={<InventoryPage api={api} isAdmin={true} />} />
            <Route path="/inventory/asset/:assetId" element={<AssetDetailPage api={api} isAdmin={true} />} />
            <Route path="/scan/:miczonId" element={<ScanRedirect api={api} />} />
            <Route path="/employees" element={<EmployeeDirectory api={api} isAdmin={true} />} />
            <Route path="/requests" element={<RequestManager api={api} isAdmin={true} />} />
            <Route path="/health-checks" element={<HealthChecks api={api} isAdmin={true} />} />
            <Route path="/portal" element={<EmployeePortal api={api} user={user} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        ) : (
          <Routes>
            <Route path="/portal" element={<EmployeePortal api={api} user={user} />} />
            <Route path="*" element={<Navigate to="/portal" replace />} />
          </Routes>
        )}
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
  const navigate = useNavigate();
  const [assets, setAssets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  
  // Search and Filter State
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState(new URLSearchParams(location.search).get('status') || '');
  
  // Pagination State
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [qrLabelsDialogOpen, setQrLabelsDialogOpen] = useState(false);
  const [scanDialogOpen, setScanDialogOpen] = useState(false);
  const [qrAsset, setQrAsset] = useState(null);
  const [form, setForm] = useState(emptyAsset);
  const [editingId, setEditingId] = useState(null);
  const [importFile, setImportFile] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [isDraggingImport, setIsDraggingImport] = useState(false);
  const [stagingData, setStagingData] = useState(null); // Valid rows
  const [stagingErrors, setStagingErrors] = useState([]); // Rows with reconciliation issues
  const [stagingSummary, setStagingSummary] = useState(null);
  const [notice, setNotice] = useState('');

  // 1. Debounce Search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to page 1 on new search
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setStatusFilter(new URLSearchParams(location.search).get('status') || '');
    setPage(1); // Reset to page 1 on external status filter change
  }, [location.search]);

  // 2. Load Assets with Pagination
  const loadAssets = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ 
      page: String(page),
      page_size: String(inventoryPageSize) 
    });
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (statusFilter) params.set('status', statusFilter);
    if (departmentFilter) params.set('department', departmentFilter);

    return api.get(`/assets/?${params.toString()}`)
      .then((res) => {
        setAssets(normalizeList(res.data));
        setTotalCount(res.data.count || 0);
      })
      .catch(() => setNotice('Unable to load hardware inventory.'))
      .finally(() => setLoading(false));
  }, [api, debouncedSearch, statusFilter, departmentFilter, page]);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  useEffect(() => {
    fetchAll(api, '/employees/').then(setEmployees);
    fetchAll(api, '/departments/').then(setDepartments);
  }, [api]);

  useEffect(() => {
    if (location.pathname !== '/inventory/add') return;
    const scannedMiczonId = new URLSearchParams(location.search).get('miczon_id') || '';
    setEditingId(null);
    setForm({ ...emptyAsset, miczon_id: scannedMiczonId });
    setDialogOpen(true);
  }, [location.pathname, location.search]);

  const closeAssetDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    setForm(emptyAsset);
    if (location.pathname === '/inventory/add') {
      navigate('/inventory', { replace: true });
    }
  };

  const closeImportDialog = () => {
    if (importLoading) return;
    setImportDialogOpen(false);
    setImportFile(null);
    setImportStatus(null);
    setIsDraggingImport(false);
    setStagingData(null);
    setStagingErrors([]);
    setStagingSummary(null);
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

  const selectImportFile = (file) => {
    if (!file) return;
    const isExcelFile = /\.(xls|xlsx)$/i.test(file.name);
    if (!isExcelFile) {
      setImportFile(null);
      setImportStatus({ tone: 'error', message: 'Please choose a .xls or .xlsx file.' });
      return;
    }
    setImportFile(file);
    setImportStatus(null);
  };

  const downloadImportTemplate = async () => {
    try {
      const response = await api.get('/assets/import-template/', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'asset_import_template.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setImportStatus({ tone: 'error', message: 'Unable to download the template right now.' });
    }
  };

  const submitImport = async (event) => {
    event.preventDefault();
    if (!importFile) {
      setImportStatus({ tone: 'error', message: 'Choose an Excel file before submitting.' });
      return;
    }

    const payload = new FormData();
    payload.append('file', importFile);
    setImportLoading(true);
    setImportStatus(null);

    try {
      const response = await api.post('/assets/import/', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      setStagingData(response.data.valid_rows || []);
      setStagingErrors(response.data.errors || []);
      setStagingSummary(response.data.summary || {});
      setImportFile(null);
    } catch (err) {
      setImportStatus({
        tone: 'error',
        message: err.response?.data?.message || err.response?.data?.error || 'Unable to analyze Excel file.',
      });
    } finally {
      setImportLoading(false);
    }
  };

  const confirmBulkImport = async () => {
    if (!stagingData || stagingData.length === 0) return;
    
    setImportLoading(true);
    try {
      const response = await api.post('/assets/bulk-commit/', { rows: stagingData });
      setNotice(response.data.message);
      closeImportDialog();
      await loadAssets();
    } catch (err) {
      setImportStatus({
        tone: 'error',
        message: err.response?.data?.message || 'Bulk commit failed.',
      });
    } finally {
      setImportLoading(false);
    }
  };

  const totalPages = Math.ceil(totalCount / inventoryPageSize);

  return (
    <>
      <PageHeader eyebrow="Inventory Management" title="Hardware register">
        {isAdmin && <Button type="button" variant="outline" onClick={() => setImportDialogOpen(true)}>Import Assets</Button>}
        <Button type="button" variant="outline" onClick={() => setQrLabelsDialogOpen(true)}>QR Labels</Button>
        <Button type="button" variant="primary" onClick={() => setDialogOpen(true)}>Add Asset</Button>
      </PageHeader>
      {notice && <Notice>{notice}</Notice>}

      <section className="panel" style={{ position: 'relative' }}>
        {loading && (
          <div className="loading-overlay">
            <div className="loading-spinner">
              <span>Updating...</span>
            </div>
          </div>
        )}
        <div className="panel-heading inventory-heading">
          <div>
            <h2>All Hardware</h2>
            <p className="panel-subtitle">
              {totalCount} item{totalCount === 1 ? '' : 's'} total
            </p>
          </div>
        </div>
        <div className="filter-bar">
          <input className="search" placeholder="Search Miczon ID, device, custodian..." value={search} onChange={(e) => setSearch(e.target.value)} />
          <Select value={departmentFilter} onChange={(e) => { setDepartmentFilter(e.target.value); setPage(1); }}>
            <option value="">All Departments</option>
            {departments.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
          </Select>
          <Select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}>
            <option value="">All Statuses</option>
            {assetStatuses.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
          </Select>
          <Button type="button" variant="ghost" onClick={() => { setSearch(''); setDepartmentFilter(''); setStatusFilter(''); setPage(1); }}>Reset</Button>
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
              <Button type="button" variant="ghost" size="sm" onClick={() => setQrAsset(asset)}>QR</Button>
              <Button type="button" variant="outline" size="sm" onClick={() => navigate(`/inventory/asset/${asset.id}`)}>View</Button>
            </div>,
          ])}
          empty={loading ? "Loading inventory..." : "No assets match the current filters."}
        />
        
        {/* Pagination UI */}
        {totalPages > 1 && (
          <div className="pagination-bar">
            <Button 
              type="button" variant="ghost" size="sm" 
              disabled={page <= 1 || loading} 
              onClick={() => setPage(p => p - 1)}
            >
              Previous
            </Button>
            <span className="pagination-info">
              Page {page} of {totalPages}
            </span>
            <Button 
              type="button" variant="ghost" size="sm" 
              disabled={page >= totalPages || loading} 
              onClick={() => setPage(p => p + 1)}
            >
              Next
            </Button>
          </div>
        )}
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

      <Dialog open={importDialogOpen}>
        <DialogContent className="import-dialog" style={{ width: stagingData || stagingErrors.length > 0 ? 'min(1100px, 100%)' : 'min(760px, 100%)' }}>
          <DialogHeader title="Import Assets" description={stagingSummary ? `Reconciliation Preview: ${stagingSummary.valid} valid rows, ${stagingSummary.errors} errors identified.` : "Upload an Excel file to analyze hardware before committing to the database."} />
          
          {!stagingSummary ? (
            <form className="stack-form" onSubmit={submitImport}>
              <div className="import-template-row">
                <div>
                  <strong>Asset Import Staging</strong>
                  <small>Upload your hardware list. Every custodian will be reconciled against existing employee records.</small>
                </div>
                <Button type="button" variant="outline" onClick={downloadImportTemplate} disabled={importLoading}>
                  Download Template
                </Button>
              </div>

              <label
                className={`file-drop-zone ${isDraggingImport ? 'dragging' : ''}`}
                onDragOver={(event) => {
                  event.preventDefault();
                  setIsDraggingImport(true);
                }}
                onDragLeave={() => setIsDraggingImport(false)}
                onDrop={(event) => {
                  event.preventDefault();
                  setIsDraggingImport(false);
                  selectImportFile(event.dataTransfer.files?.[0]);
                }}
              >
                <input
                  type="file"
                  accept=".xls,.xlsx"
                  onChange={(event) => selectImportFile(event.target.files?.[0])}
                  disabled={importLoading}
                />
                <span>{importFile ? importFile.name : 'Drop Excel file here or click to browse'}</span>
                <small>.xls and .xlsx files only</small>
              </label>

              {importStatus && <Notice tone={importStatus.tone}>{importStatus.message}</Notice>}

              <div className="dialog-footer">
                <Button type="button" variant="ghost" onClick={closeImportDialog} disabled={importLoading}>Cancel</Button>
                <Button type="submit" variant="primary" disabled={importLoading || !importFile}>
                  {importLoading ? 'Analyzing...' : 'Scan File'}
                </Button>
              </div>
            </form>
          ) : (
            <div className="import-staging-view">
              <div style={{ maxHeight: '450px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: '8px', marginBottom: '1rem' }}>
                <DataTable
                  columns={['#', 'Miczon ID', 'Device', 'Reconciled Custodian', 'Status', 'Messages']}
                  rows={[
                    ...stagingData.map(row => [
                      row.excel_row,
                      <strong>{row.miczon_id}</strong>,
                      row.name,
                      <span className="text-success">{row.custodian_name || 'No custodian'}</span>,
                      <StatusBadge status="Ready" />,
                      <span style={{ fontSize: '12px', color: '#64748b' }}>Validated</span>
                    ]),
                    ...stagingErrors.map(row => [
                      row.row,
                      <strong className="text-danger">{row.miczon_id || 'N/A'}</strong>,
                      '-',
                      '-',
                      <StatusBadge status="Error" />,
                      <div className="text-danger" style={{ fontSize: '11px', maxWidth: '240px' }}>
                        {row.messages.map((m, i) => <div key={i}>• {m}</div>)}
                      </div>
                    ])
                  ].sort((a, b) => Number(a[0]) - Number(b[0]))}
                  empty="No preview data available."
                />
              </div>

              {importStatus && <Notice tone={importStatus.tone}>{importStatus.message}</Notice>}

              <div className="dialog-footer">
                <Button type="button" variant="ghost" onClick={() => { setStagingSummary(null); setStagingData(null); setStagingErrors([]); }} disabled={importLoading}>Back to Upload</Button>
                <Button type="button" variant="primary" onClick={confirmBulkImport} disabled={importLoading || stagingData.length === 0}>
                  {importLoading ? 'Committing...' : `Confirm Import (${stagingData.length} rows)`}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!qrAsset}>
        <DialogContent className="qr-dialog">
          <DialogHeader title="Asset QR Code" description={qrAsset ? `${qrAsset.name} - ${qrAsset.miczon_id}` : ''} />
          {qrAsset && (
            <div className="qr-preview">
              <QRCodeCanvas value={getQrPayload(qrAsset.miczon_id)} size={180} includeMargin />
              <strong>Miczon ID: {qrAsset.miczon_id}</strong>
              <small>{getQrPayload(qrAsset.miczon_id)}</small>
            </div>
          )}
          <div className="dialog-footer">
            <Button type="button" variant="ghost" onClick={() => setQrAsset(null)}>Close</Button>
            <Button type="button" variant="primary" onClick={() => navigate(`/inventory/asset/${qrAsset?.id}`)}>Open Asset</Button>
          </div>
        </DialogContent>
      </Dialog>

      <QrLabelsDialog open={qrLabelsDialogOpen} onClose={() => setQrLabelsDialogOpen(false)} onOpenScanner={() => { setQrLabelsDialogOpen(false); setScanDialogOpen(true); }} api={api} />
      <ScanAssetDialog open={scanDialogOpen} onClose={() => setScanDialogOpen(false)} api={api} />
    </>
  );
}

function AssetDetailPage({ api, isAdmin }) {
  const { assetId } = useParams();
  const navigate = useNavigate();
  const [asset, setAsset] = useState(null);
  const [notice, setNotice] = useState('');

  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyAsset);

  useEffect(() => {
    api.get(`/assets/${assetId}/`)
      .then((res) => setAsset(res.data))
      .catch(() => setNotice('Unable to load asset details.'));
  }, [api, assetId]);

  useEffect(() => {
    fetchAll(api, '/employees/').then(setEmployees);
    fetchAll(api, '/departments/').then(setDepartments);
  }, [api]);

  const editAsset = () => {
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

  const removeAsset = async () => {
    if (!window.confirm(`Remove ${asset.name}?`)) return;
    await api.delete(`/assets/${asset.id}/`);
    navigate('/inventory');
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
      await api.patch(`/assets/${asset.id}/`, payload);
      setNotice('Hardware updated.');
      setDialogOpen(false);
      api.get(`/assets/${assetId}/`).then((res) => setAsset(res.data));
    } catch (err) {
      setNotice(err.response?.data?.error || 'Unable to save hardware.');
    }
  };

  if (notice && !asset) return <Notice tone="error">{notice}</Notice>;
  if (!asset) return <div className="loading-screen">Loading asset...</div>;

  return (
    <>
      <PageHeader eyebrow="Asset Detail" title={asset.name}>
        <Button type="button" variant="ghost" onClick={() => navigate('/inventory')}>Back</Button>
        <Button type="button" variant="outline" onClick={editAsset}>Edit</Button>
        {isAdmin && <Button type="button" variant="danger" onClick={removeAsset}>Remove</Button>}
        <Button type="button" variant="primary" onClick={() => window.print()}>Print Asset Tag</Button>
      </PageHeader>
      {notice && <Notice>{notice}</Notice>}

      <section className="panel asset-detail-panel">
        <div className="asset-detail-grid">
          <div>
            <span>Miczon ID</span>
            <strong>{asset.miczon_id}</strong>
          </div>
          <div>
            <span>Category</span>
            <strong>{asset.category || 'Uncategorized'}</strong>
          </div>
          <div>
            <span>Status</span>
            <StatusBadge status={asset.current_status} />
          </div>
          <div>
            <span>Department</span>
            <strong>{asset.department_name || 'No department'}</strong>
          </div>
          <div>
            <span>Custodian</span>
            <strong>{asset.custodian_name || 'Unassigned'}</strong>
          </div>
        </div>
      </section>

      <section className="panel qr-detail-panel">
        <div className="qr-preview">
          <QRCodeCanvas value={getQrPayload(asset.miczon_id)} size={180} includeMargin />
          <strong>Miczon ID: {asset.miczon_id}</strong>
          <small>{getQrPayload(asset.miczon_id)}</small>
        </div>
      </section>

      <div className="asset-tag-print-only">
        <div className="asset-print-label">
          <QRCodeCanvas value={getQrPayload(asset.miczon_id)} size={170} includeMargin />
          <strong>Miczon ID: {asset.miczon_id}</strong>
          <span>Device: {asset.name}</span>
          <span>Custodian: {asset.custodian_name || 'Unassigned'}</span>
        </div>
      </div>

      <Dialog open={dialogOpen}>
        <DialogContent>
          <DialogHeader title="Edit Asset" description="Register hardware with the fields used by the asset workflow." />
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
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" variant="primary">Save Changes</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

function QrLabelsDialog({ open, onClose, onOpenScanner, api }) {
  const [quantity, setQuantity] = useState(12);
  const [miczonIds, setMiczonIds] = useState([]);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const generateAndPrint = async (event) => {
    event.preventDefault();
    const safeQuantity = Math.max(1, Math.min(Number(quantity) || 1, 500));
    setLoading(true);
    setNotice('');

    try {
      const response = await api.get(`/assets/next-miczon-ids/?quantity=${safeQuantity}`);
      setMiczonIds(response.data?.ids || []);
      window.setTimeout(() => window.print(), 100);
    } catch {
      setNotice('Unable to generate Miczon IDs.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="qr-labels-dialog">
        <DialogHeader title="QR Labels" description="Generate bulk QR labels." />
        <div className="modal-toolbar" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
          <Button type="button" variant="outline" onClick={onOpenScanner}>Scan QR Asset</Button>
        </div>
        {notice && <Notice tone="error">{notice}</Notice>}
        <section className="panel qr-generator-controls">
          <form className="form-grid" onSubmit={generateAndPrint}>
            <Field label="Quantity">
              <input min="1" max="500" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
            </Field>
            <div className="form-action-cell">
              <Button type="submit" variant="primary" disabled={loading}>{loading ? 'Generating...' : 'Generate & Print'}</Button>
            </div>
          </form>
        </section>

        <section className="panel qr-print-surface">
          {miczonIds.length === 0 ? (
            <p className="empty-state">Generate labels to preview the printable QR grid.</p>
          ) : (
            <div className="qr-label-grid">
              {miczonIds.map((miczonId) => (
                <div className="qr-label" key={miczonId}>
                  <QRCodeCanvas value={getQrPayload(miczonId)} size={132} includeMargin />
                  <strong>Miczon ID: {miczonId}</strong>
                </div>
              ))}
            </div>
          )}
        </section>
        <div className="dialog-footer">
          <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ScanRedirect({ api }) {
  const { miczonId } = useParams();
  const navigate = useNavigate();

  useEffect(() => {
    const resolveScan = async () => {
      const cleanMiczonId = extractMiczonIdFromScan(miczonId);
      try {
        const response = await api.get(`/scan/${encodeURIComponent(cleanMiczonId)}/`);
        if (response.data?.status === 'found') {
          navigate(`/inventory/asset/${response.data.asset_id}`, { replace: true });
        } else {
          navigate(`/inventory/add?miczon_id=${encodeURIComponent(response.data?.miczon_id || cleanMiczonId)}`, { replace: true });
        }
      } catch {
        navigate('/inventory', { replace: true });
      }
    };

    resolveScan();
  }, [api, miczonId, navigate]);

  return <div className="loading-screen">Resolving QR code...</div>;
}

function ScanAssetDialog({ open, onClose, api }) {
  const navigate = useNavigate();
  const scannerRef = useRef(null);
  const [manualCode, setManualCode] = useState('');
  const [notice, setNotice] = useState('');
  const [isScanning, setIsScanning] = useState(false);

  const stopScanner = useCallback(async () => {
    if (!scannerRef.current) return;
    const scanner = scannerRef.current;
    try {
      await scanner.stop();
    } catch {
      // Camera cleanup can throw if the stream has already been stopped by the browser.
    }
    try {
      await scanner.clear();
    } catch {
      // The reader element may already be cleared during route changes.
    }
    scannerRef.current = null;
    setIsScanning(false);
  }, []);

  useEffect(() => {
    if (!open) stopScanner();
  }, [open, stopScanner]);

  useEffect(() => () => {
    stopScanner();
  }, [stopScanner]);

  const resolveMiczonId = useCallback(async (value) => {
    const miczonId = extractMiczonIdFromScan(value);
    if (!miczonId) return;
    await stopScanner();

    try {
      const response = await api.get(`/scan/${encodeURIComponent(miczonId)}/`);
      if (response.data?.status === 'found') {
        navigate(`/inventory/asset/${response.data.asset_id}`);
      } else {
        navigate(`/inventory/add?miczon_id=${encodeURIComponent(response.data?.miczon_id || miczonId)}`);
      }
      onClose();
    } catch {
      setNotice('Unable to resolve scanned asset.');
    }
  }, [api, navigate, stopScanner, onClose]);

  const startScanner = async () => {
    setNotice('');
    await stopScanner();

    try {
      const { Html5Qrcode } = await import('html5-qrcode');
      const scanner = new Html5Qrcode('asset-scanner-reader');
      scannerRef.current = scanner;
      setIsScanning(true);

      await scanner.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => resolveMiczonId(decodedText),
      );
    } catch (error) {
      setIsScanning(false);
      scannerRef.current = null;
      setNotice(error?.message || 'Unable to start camera scanner.');
    }
  };

  return (
    <Dialog open={open}>
      <DialogContent className="scanner-dialog">
        <DialogHeader title="Scan Asset" description="Use your camera to scan an asset QR code or enter an ID manually." />
        {notice && <Notice tone="error">{notice}</Notice>}
        <section className="panel scanner-panel">
          <div id="asset-scanner-reader" className="scanner-reader" />
          <div className="scanner-actions">
            <Button type="button" variant="primary" onClick={startScanner} disabled={isScanning}>Start Camera</Button>
            <Button type="button" variant="ghost" onClick={stopScanner} disabled={!isScanning}>Stop</Button>
          </div>
          <form className="manual-scan-form" onSubmit={(event) => { event.preventDefault(); resolveMiczonId(manualCode); }}>
            <Field label="Manual Miczon ID or QR URL">
              <input value={manualCode} onChange={(event) => setManualCode(event.target.value)} placeholder="MZ-1001 or https://.../scan/MZ-1001" />
            </Field>
            <Button type="submit" variant="outline">Resolve</Button>
          </form>
        </section>
        <div className="dialog-footer">
          <Button type="button" variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
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

  // Bulk Import States
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [importStatus, setImportStatus] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [isDraggingImport, setIsDraggingImport] = useState(false);

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

  // Import Logic
  const selectImportFile = (file) => {
    if (!file) return;
    const isExcelFile = /\.(xls|xlsx)$/i.test(file.name);
    if (!isExcelFile) {
      setImportFile(null);
      setImportStatus({ tone: 'error', message: 'Please choose a .xls or .xlsx file.' });
      return;
    }
    setImportFile(file);
    setImportStatus(null);
  };

  const closeImportDialog = () => {
    if (importLoading) return;
    setImportDialogOpen(false);
    setImportFile(null);
    setImportStatus(null);
    setIsDraggingImport(false);
  };

  const downloadImportTemplate = async () => {
    try {
      const response = await api.get('/employees/import-template/', { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'employee_import_template.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setImportStatus({ tone: 'error', message: 'Unable to download the template right now.' });
    }
  };

  const submitImport = async (event) => {
    event.preventDefault();
    if (!importFile) {
      setImportStatus({ tone: 'error', message: 'Choose an Excel file before submitting.' });
      return;
    }

    const payload = new FormData();
    payload.append('file', importFile);
    setImportLoading(true);
    setImportStatus(null);

    try {
      const response = await api.post('/employees/import/', payload, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const errors = response.data?.errors || [];
      setImportStatus({
        tone: errors.length ? 'warning' : 'success',
        message: response.data?.message || 'Employees imported successfully.',
        errors,
      });
      setImportFile(null);
      await loadEmployees();
    } catch (err) {
      setImportStatus({
        tone: 'error',
        message: err.response?.data?.message || err.response?.data?.error || 'Unable to import employees.',
        errors: err.response?.data?.errors || [],
      });
    } finally {
      setImportLoading(false);
    }
  };

  const allSelected = assets.length > 0 && selectedAssetIds.length === assets.length;

  return (
    <>
      <PageHeader eyebrow="Employee Directory" title="People and assigned gear">
        <div style={{ display: 'flex', gap: '10px' }}>
          {isAdmin && <Button type="button" variant="outline" onClick={() => setImportDialogOpen(true)}>Import Employees</Button>}
          {isAdmin && <Button type="button" variant="primary" onClick={() => setEmployeeDialogOpen(true)}>Add Employee</Button>}
        </div>
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

      <Dialog open={importDialogOpen}>
        <DialogContent className="import-dialog">
          <DialogHeader title="Import Employees" description="Upload an Excel file to bulk register employees." />
          <form className="stack-form" onSubmit={submitImport}>
            <div className="import-template-row">
              <div>
                <strong>Employee template</strong>
                <small>Match these columns: Name, Employee ID, Email, Department.</small>
              </div>
              <Button type="button" variant="outline" onClick={downloadImportTemplate} disabled={importLoading}>
                Download Template
              </Button>
            </div>

            <label
              className={`file-drop-zone ${isDraggingImport ? 'dragging' : ''}`}
              onDragOver={(event) => {
                event.preventDefault();
                setIsDraggingImport(true);
              }}
              onDragLeave={() => setIsDraggingImport(false)}
              onDrop={(event) => {
                event.preventDefault();
                setIsDraggingImport(false);
                selectImportFile(event.dataTransfer.files?.[0]);
              }}
            >
              <input
                type="file"
                accept=".xls,.xlsx"
                onChange={(event) => selectImportFile(event.target.files?.[0])}
                disabled={importLoading}
              />
              <span>{importFile ? importFile.name : 'Drop Excel file here or click to browse'}</span>
              <small>.xls and .xlsx files only</small>
            </label>

            {importStatus && (
              <Notice tone={importStatus.tone}>
                {importStatus.message}
                {importStatus.errors?.length > 0 && (
                  <ul className="import-error-list">
                    {importStatus.errors.slice(0, 8).map((error) => <li key={error}>{error}</li>)}
                    {importStatus.errors.length > 8 && <li>+{importStatus.errors.length - 8} more row issues</li>}
                  </ul>
                )}
              </Notice>
            )}

            <div className="dialog-footer">
              <Button type="button" variant="ghost" onClick={closeImportDialog} disabled={importLoading}>Cancel</Button>
              <Button type="submit" variant="primary" disabled={importLoading || !importFile}>
                {importLoading ? 'Importing...' : 'Submit'}
              </Button>
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
    const admin_remarks = window.prompt(`Optional remarks for ${action}:`);
    if (admin_remarks === null) return; // Cancelled
    
    try {
      await api.post(`/requests/${id}/${action}/`, { admin_remarks: admin_remarks || `Processed via Request Manager.` });
      setNotice(`Request ${action === 'approve' ? 'approved' : 'denied'}.`);
      loadRequests();
    } catch (err) {
      setNotice(err.response?.data?.error || 'Unable to process request.');
    }
  };

  return (
    <>
      <PageHeader eyebrow="Request Manager" title="Review hardware requests" />
      {notice && <Notice>{notice}</Notice>}
      <section className="panel">
        <DataTable
          columns={['Requester', 'Device', 'Reason', 'Status', 'Processed At', 'Actions']}
          rows={requests.map((request) => [
            request.requester_name,
            <div>
              <strong>{request.asset_name || request.requested_device_type || request.asset_miczon_id || 'New hardware'}</strong>
              {request.specifications && <><br/><small>Specs: {request.specifications}</small></>}
              <br/><small>Created: {new Date(request.created_at).toLocaleDateString()}</small>
            </div>,
            request.reason_for_request || request.remarks || 'No reason provided',
            <StatusBadge status={request.status} />,
            request.processed_at ? new Date(request.processed_at).toLocaleDateString() : '-',
            isAdmin && request.status === 'PENDING' ? (
              <div className="row-actions">
                <Button type="button" variant="primary" size="sm" onClick={() => processRequest(request.id, 'approve')}>Approve</Button>
                <Button type="button" variant="danger" size="sm" onClick={() => processRequest(request.id, 'reject')}>Deny</Button>
              </div>
            ) : (
              <div style={{ maxWidth: '200px', fontSize: '0.875rem', color: '#64748b' }}>
                {request.admin_remarks || 'No remarks'}
              </div>
            ),
          ])}
          empty="No requests yet."
        />
      </section>
    </>
  );
}

function HealthChecks({ api, isAdmin }) {
  const [sessions, setSessions] = useState([]);
  const [report, setReport] = useState(null);
  const [selectedSession, setSelectedSession] = useState('');
  const [activeReportView, setActiveReportView] = useState('');
  const [reportSearch, setReportSearch] = useState('');
  const [reportDepartment, setReportDepartment] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    const reportPath = selectedSession ? `/reports/health-compliance/?session=${selectedSession}` : '/reports/health-compliance/';
    Promise.all([fetchAll(api, '/health-checks/'), api.get(reportPath)]).then(([sessionRows, reportRes]) => {
      setSessions(sessionRows);
      setReport(reportRes.data);
      if (!selectedSession && reportRes.data.session?.id) {
        setSelectedSession(String(reportRes.data.session.id));
      }
    });
  }, [api, selectedSession]);

  useEffect(() => {
    load();
  }, [load]);

  const trigger = async () => {
    const res = await api.post('/health-checks/trigger-global/');
    setNotice(`Monthly inspection started for ${res.data.assigned_assets || res.data.target_assets || 0} hardware item(s).`);
    setSelectedSession(String(res.data.session?.id || ''));
  };

  const summary = report?.summary || {};
  const pendingRows = report?.pending_by_employee || [];
  const departmentRows = report?.department_summary || [];
  const responseRows = report?.responses || [];
  const sessionTitle = report?.session?.title || 'No active inspection';
  const pendingAssetRows = pendingRows.flatMap((row) => row.assets.map((asset) => ({ ...asset, employee: row })));
  const criticalRows = responseRows.filter((response) => Number(response.performance_rating) < 3);
  const reportDepartments = Array.from(new Set([
    ...departmentRows.map((row) => row.department).filter(Boolean),
    ...pendingRows.map((row) => row.department).filter(Boolean),
  ])).sort((a, b) => a.localeCompare(b));

  useEffect(() => {
    setReportSearch('');
    setReportDepartment('');
  }, [activeReportView, selectedSession]);

  const matchesSearch = (values) => {
    const needle = reportSearch.trim().toLowerCase();
    if (!needle) return true;
    return values.some((value) => String(value || '').toLowerCase().includes(needle));
  };

  const matchesDepartment = (department) => !reportDepartment || department === reportDepartment;
  const filteredDepartmentRows = departmentRows.filter((row) => matchesDepartment(row.department) && matchesSearch([row.department, row.target, row.completed, row.pending]));
  const filteredPendingRows = pendingRows.filter((row) => (
    matchesDepartment(row.department) && matchesSearch([
      row.employee_name,
      row.employee_code,
      row.email,
      row.department,
      row.pending_count,
      ...row.assets.flatMap((asset) => [asset.name, asset.miczon_id, asset.category]),
    ])
  ));
  const filteredPendingAssetRows = pendingAssetRows.filter((asset) => (
    matchesDepartment(asset.employee.department) && matchesSearch([
      asset.name,
      asset.miczon_id,
      asset.category,
      asset.employee.employee_name,
      asset.employee.employee_code,
      asset.employee.email,
      asset.employee.department,
    ])
  ));
  const filteredCriticalRows = criticalRows.filter((response) => matchesSearch([
    response.asset_name,
    response.asset_miczon_id,
    response.employee_name,
    response.screen_condition,
    response.battery_life,
    response.performance_rating,
  ]));

  const openReportView = (view) => {
    setActiveReportView(view);
  };

  const closeReportView = () => {
    setActiveReportView('');
  };

  return (
    <>
      <PageHeader eyebrow="Monthly Inspection" title="Monthly inspection report">
        {isAdmin && <Button type="button" variant="primary" onClick={trigger}>Start Monthly Inspection</Button>}
      </PageHeader>
      {notice && <Notice>{notice}</Notice>}

      <section className="panel report-hero">
        <div>
          <p className="panel-subtitle">Current report period</p>
          <h2>{sessionTitle}</h2>
        </div>
        <div className="report-period-control">
          <span>Inspection period</span>
          <Select value={selectedSession} onChange={(event) => setSelectedSession(event.target.value)} disabled={sessions.length === 0}>
            {sessions.length === 0 ? (
              <option value="">No sessions</option>
            ) : sessions.map((session) => (
              <option key={session.id} value={session.id}>{session.title}</option>
            ))}
          </Select>
        </div>
      </section>

      <section className="report-metrics">
        <button type="button" className={`report-metric-card ${activeReportView === 'completion' ? 'active' : ''}`} onClick={() => openReportView('completion')} aria-pressed={activeReportView === 'completion'}>
          <span>Completion</span>
          <strong>{summary.completion_rate ?? 0}%</strong>
          <small>{summary.completed_assets || 0} of {summary.target_assets || 0} assets checked</small>
        </button>
        <button type="button" className={`report-metric-card warning ${activeReportView === 'pending-assets' ? 'active' : ''}`} onClick={() => openReportView('pending-assets')} aria-pressed={activeReportView === 'pending-assets'}>
          <span>Pending Assets</span>
          <strong>{summary.pending_assets || 0}</strong>
          <small>Still waiting for inspection</small>
        </button>
        <button type="button" className={`report-metric-card amber ${activeReportView === 'pending-employees' ? 'active' : ''}`} onClick={() => openReportView('pending-employees')} aria-pressed={activeReportView === 'pending-employees'}>
          <span>Pending Employees</span>
          <strong>{summary.pending_employees || 0}</strong>
          <small>People who still need to respond</small>
        </button>
        <button type="button" className={`report-metric-card danger ${activeReportView === 'critical' ? 'active' : ''}`} onClick={() => openReportView('critical')} aria-pressed={activeReportView === 'critical'}>
          <span>Critical Alerts</span>
          <strong>{summary.critical_alerts || 0}</strong>
          <small>Ratings below 3</small>
        </button>
      </section>

      {!activeReportView && (
        <section className="panel report-empty-panel">
          <h2>Select a report card</h2>
          <p>Click a metric above to open the exact inspection detail you need.</p>
        </section>
      )}

      {activeReportView && (
        <section className="panel report-filter-panel">
          <input
            className="search"
            type="search"
            placeholder="Search employee, asset, ID, department..."
            value={reportSearch}
            onChange={(event) => setReportSearch(event.target.value)}
          />
          {activeReportView !== 'critical' && (
            <Select value={reportDepartment} onChange={(event) => setReportDepartment(event.target.value)}>
              <option value="">All departments</option>
              {reportDepartments.map((department) => <option key={department} value={department}>{department}</option>)}
            </Select>
          )}
          <Button type="button" variant="ghost" onClick={() => { setReportSearch(''); setReportDepartment(''); }}>Reset Filters</Button>
        </section>
      )}

      {activeReportView === 'completion' && (
        <section className="panel report-main-panel">
          <div className="panel-heading">
            <div>
              <h2>Department Completion</h2>
              <p className="panel-subtitle">Coverage by department for the selected inspection period.</p>
            </div>
            <Button type="button" variant="ghost" onClick={closeReportView}>Clear View</Button>
          </div>
          <DataTable
            columns={['Department', 'Target', 'Done', 'Pending', 'Completion']}
            rows={filteredDepartmentRows.map((row) => [
              row.department,
              row.target,
              row.completed,
              <strong className={row.pending > 0 ? 'text-danger' : 'text-success'}>{row.pending}</strong>,
              `${row.target ? Math.round((row.completed / row.target) * 100) : 0}%`,
            ])}
            empty="No department data for this session."
          />
        </section>
      )}

      {activeReportView === 'pending-assets' && (
        <section className="panel report-main-panel">
          <div className="panel-heading">
            <div>
              <h2>Pending Assets</h2>
              <p className="panel-subtitle">Every assigned asset still waiting for an inspection response.</p>
            </div>
            <Button type="button" variant="ghost" onClick={closeReportView}>Clear View</Button>
          </div>
          <DataTable
            columns={['Asset', 'Employee', 'Department', 'Category']}
            rows={filteredPendingAssetRows.map((asset) => [
              <strong>{asset.name} ({asset.miczon_id})</strong>,
              <div className="employee-cell">
                <strong>{asset.employee.employee_name}</strong>
                <small>{asset.employee.employee_code || 'No employee ID'}</small>
              </div>,
              asset.employee.department,
              asset.category || 'Uncategorized',
            ])}
            empty="No pending assets for this inspection."
          />
        </section>
      )}

      {activeReportView === 'pending-employees' && (
        <section className="panel report-main-panel">
          <div className="panel-heading">
            <div>
              <h2>Pending Employees</h2>
              <p className="panel-subtitle">Employees who still need to complete one or more asset inspections.</p>
            </div>
            <Button type="button" variant="ghost" onClick={closeReportView}>Clear View</Button>
          </div>
          <DataTable
            columns={['Employee', 'Department', 'Pending', 'Assets']}
            rows={filteredPendingRows.map((row) => [
              <div className="employee-cell">
                <strong>{row.employee_name}</strong>
                <small>{row.employee_code || 'No employee ID'}{row.email ? ` - ${row.email}` : ''}</small>
              </div>,
              row.department,
              <strong>{row.pending_count}</strong>,
              <div className="asset-chip-list">
                {row.assets.slice(0, 4).map((asset) => (
                  <span className="asset-chip" key={asset.id}>{asset.name} ({asset.miczon_id})</span>
                ))}
                {row.assets.length > 4 && <span className="asset-chip muted">+{row.assets.length - 4} more</span>}
              </div>,
            ])}
            empty="Everyone has completed this inspection."
          />
        </section>
      )}

      {activeReportView === 'critical' && (
        <section className="panel report-main-panel">
          <div className="panel-heading">
            <div>
              <h2>Critical Alerts</h2>
              <p className="panel-subtitle">Submitted inspections with a performance rating below 3.</p>
            </div>
            <Button type="button" variant="ghost" onClick={closeReportView}>Clear View</Button>
          </div>
          <DataTable
            columns={['Asset', 'Employee', 'Screen', 'Battery', 'Rating']}
            rows={filteredCriticalRows.map((response) => [
              `${response.asset_name} (${response.asset_miczon_id})`,
              response.employee_name,
              response.screen_condition,
              response.battery_life,
              <strong className="text-danger">{response.performance_rating}/5</strong>,
            ])}
            empty="No critical alerts for this inspection."
          />
        </section>
      )}
    </>
  );
}

function EmployeePortal({ api, user }) {
  const employee = user?.employee_details;
  const [gear, setGear] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [pendingAssets, setPendingAssets] = useState([]);
  const [activeSession, setActiveSession] = useState('');
  
  const [requestsListDialogOpen, setRequestsListDialogOpen] = useState(false);
  const [myRequests, setMyRequests] = useState([]);
  const [editingRequestId, setEditingRequestId] = useState(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [inspectionDialogOpen, setInspectionDialogOpen] = useState(false);
  
  const [requestForm, setRequestForm] = useState({ requested_device_type: 'Laptop', specifications: '', remarks: '' });
  const [healthForm, setHealthForm] = useState({});
  const [notice, setNotice] = useState('');

  const loadPortal = useCallback(async () => {
    if (!employee?.id) return;
    const gearRes = await api.get(`/employees/${employee.id}/assigned-assets/`);
    const openSessions = (await fetchAll(api, '/health-checks/')).filter((session) => session.status === 'OPEN');
    setGear(gearRes.data);
    setSessions(openSessions);
    
    try {
      const requestsData = await fetchAll(api, '/requests/');
      setMyRequests(requestsData);
    } catch (e) {
      console.error('Unable to fetch requests:', e);
    }

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

  const submitRequest = async (event) => {
    event.preventDefault();
    try {
      const payload = {
        action_type: 'ASSIGN',
        requested_device_type: requestForm.requested_device_type,
        specifications: requestForm.specifications,
        reason_for_request: requestForm.remarks,
        remarks: requestForm.remarks,
      };

      if (editingRequestId) {
        await api.patch(`/requests/${editingRequestId}/`, payload);
        setNotice('Hardware request updated.');
      } else {
        await api.post('/requests/', payload);
        setNotice('Hardware request submitted.');
      }
      
      setRequestForm({ requested_device_type: 'Laptop', specifications: '', remarks: '' });
      setEditingRequestId(null);
      setShowRequestForm(false);
      
      const requestsData = await fetchAll(api, '/requests/');
      setMyRequests(requestsData);
    } catch (err) {
      setNotice(err.response?.data?.error || 'Unable to submit hardware request.');
    }
  };

  const deleteRequest = async (id) => {
    if (!window.confirm("Are you sure you want to delete this pending request?")) return;
    try {
      await api.delete(`/requests/${id}/`);
      setNotice('Hardware request deleted.');
      const requestsData = await fetchAll(api, '/requests/');
      setMyRequests(requestsData);
    } catch (err) {
      setNotice(err.response?.data?.error || 'Unable to delete hardware request.');
    }
  };

  const updateHealthField = (assetId, field, value) => {
    setHealthForm((current) => ({
      ...current,
      [assetId]: { ...(current[assetId] || {}), [field]: value },
    }));
  };

  const submitHealthBatch = async (event) => {
    event.preventDefault();
    if (!activeSession || pendingAssets.length === 0) return;

    const responses = pendingAssets.map((asset) => {
      const values = healthForm[asset.id] || {};
      const inspectionValues = Object.fromEntries(
        healthInspectionFields.map((field) => [field.name, values[field.name] || field.defaultValue])
      );
      return {
        asset: asset.id,
        ...inspectionValues,
        performance_rating: Number(values.performance_rating || 4),
        comments: values.comments || '',
      };
    });

    try {
      await api.post('/health-responses/bulk-submit/', { session: activeSession, responses });
      setNotice(`${responses.length} health check response(s) saved.`);
      setHealthForm({});
      setInspectionDialogOpen(false);
      loadPortal();
    } catch (err) {
      setNotice(err.response?.data?.error || 'Unable to save health check responses.');
    }
  };

  const activeSessionTitle = sessions.find((session) => String(session.id) === String(activeSession))?.title || 'Monthly hardware inspection';

  return (
    <>
      <PageHeader eyebrow="Employee Portal" title="My gear and requests">
        <Button type="button" variant="ghost" disabled={!employee || !activeSession} onClick={() => setInspectionDialogOpen(true)}>
          Start Inspection
        </Button>
        <Button type="button" variant="primary" disabled={!employee} onClick={() => { setRequestsListDialogOpen(true); setShowRequestForm(false); }}>My Requests</Button>
      </PageHeader>
      {!employee && <Notice tone="error">Your login is not linked to an employee profile yet. Ask an admin to link your user to an employee record before using My Gear, requests, or health checks.</Notice>}
      {employee && activeSession && pendingAssets.length > 0 && <Notice tone="error">Monthly inspection required: {pendingAssets.length} assigned item(s) still need a health check.</Notice>}
      {notice && <Notice>{notice}</Notice>}

      <section className="panel portal-gear-panel">
        <div className="panel-heading inventory-heading">
          <div>
            <h2>My Gear</h2>
            <p className="panel-subtitle">{gear.length} assigned item(s)</p>
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

      <Dialog open={inspectionDialogOpen}>
        <DialogContent className="inspection-dialog">
          <DialogHeader title="Gear Inspection" description={activeSessionTitle} />
          {pendingAssets.length === 0 ? (
            <div className="dialog-footer">
              <Button type="button" variant="ghost" onClick={() => setInspectionDialogOpen(false)}>Close</Button>
            </div>
          ) : (
            <form className="health-list-form" onSubmit={submitHealthBatch}>
              <div className="health-response-list">
                {pendingAssets.map((asset, index) => {
                  const values = healthForm[asset.id] || {};
                  return (
                    <article className="health-list-item" key={asset.id}>
                      <div className="health-asset-summary">
                        <span className="health-index">{index + 1}</span>
                        <div><h3>{asset.name}</h3><p>{asset.miczon_id}</p></div>
                      </div>
                      <div className="health-control-grid">
                        {healthInspectionFields.map((field) => (
                          <Field key={field.name} label={field.label}>
                            <Select value={values[field.name] || field.defaultValue} onChange={(e) => updateHealthField(asset.id, field.name, e.target.value)}>
                              {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </Select>
                          </Field>
                        ))}
                        <Field label="Rating">
                          <Select value={values.performance_rating || 4} onChange={(e) => updateHealthField(asset.id, 'performance_rating', e.target.value)}>
                            {ratingOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                          </Select>
                        </Field>
                        <Field label="Comments" className="health-comments-field">
                          <textarea rows="2" value={values.comments || ''} onChange={(e) => updateHealthField(asset.id, 'comments', e.target.value)} />
                        </Field>
                      </div>
                    </article>
                  );
                })}
              </div>
              <div className="dialog-footer">
                <Button type="button" variant="ghost" onClick={() => setInspectionDialogOpen(false)}>Cancel</Button>
                <Button type="submit" variant="primary">Submit Inspection</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={requestsListDialogOpen}>
        <DialogContent className="requests-list-dialog" style={{ maxWidth: '900px' }}>
          <DialogHeader 
            title={editingRequestId ? "Edit Request" : "My Requests"} 
            description={editingRequestId ? "Update your pending hardware request." : "Manage your hardware requests and view history."} 
          />
          
          <div className="requests-dialog-body" style={{ maxHeight: '70vh', overflowY: 'auto', paddingRight: '0.5rem' }}>
            {/* Request Form - Toggleable */}
            {showRequestForm ? (
              <section style={{ marginBottom: '2rem', padding: '1.5rem', background: '#f8fafc', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <h3 style={{ marginBottom: '1rem' }}>{editingRequestId ? 'Edit Pending Request' : 'Submit New Request'}</h3>
                <form className="dialog-form" onSubmit={submitRequest}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <Field label="Hardware Type">
                      <Select value={requestForm.requested_device_type} onChange={(e) => setRequestForm({ ...requestForm, requested_device_type: e.target.value })}>
                        <option>Laptop</option><option>Mobile</option><option>Accessory</option><option>Monitor</option><option>Other</option>
                      </Select>
                    </Field>
                    <Field label="Specifications">
                      <input value={requestForm.specifications} onChange={(e) => setRequestForm({ ...requestForm, specifications: e.target.value })} placeholder="e.g. 16GB RAM, 512GB SSD..." />
                    </Field>
                  </div>
                  <Field label="Reason for Request">
                    <textarea required rows="3" value={requestForm.remarks} onChange={(e) => setRequestForm({ ...requestForm, remarks: e.target.value })} />
                  </Field>
                  <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end', marginTop: '1rem' }}>
                    <Button type="button" variant="ghost" onClick={() => {
                      setShowRequestForm(false);
                      setEditingRequestId(null);
                      setRequestForm({ requested_device_type: 'Laptop', specifications: '', remarks: '' });
                    }}>Cancel</Button>
                    <Button type="submit" variant="primary" disabled={!employee}>
                      {editingRequestId ? "Save Changes" : "Submit Request"}
                    </Button>
                  </div>
                </form>
              </section>
            ) : (
              <div style={{ marginBottom: '2rem', display: 'flex', justifyContent: 'flex-end' }}>
                <Button type="button" variant="primary" onClick={() => setShowRequestForm(true)}>+ New Request</Button>
              </div>
            )}

            {/* Pending Requests */}
            <section style={{ marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1rem' }}>Pending Requests</h3>
              <DataTable
                columns={['Device', 'Reason', 'Status', 'Created', 'Actions']}
                rows={myRequests.filter(r => r.status === 'PENDING').map(r => [
                  <div>
                    <strong>{r.asset_name || r.requested_device_type || r.asset_miczon_id || 'New hardware'}</strong>
                    {r.specifications && <><br/><small>Specs: {r.specifications}</small></>}
                  </div>,
                  r.reason_for_request || r.remarks || 'No reason provided',
                  <StatusBadge status={r.status} />,
                  new Date(r.created_at).toLocaleDateString(),
                  <div className="row-actions">
                    <Button type="button" variant="ghost" size="sm" title="Edit Request" onClick={() => {
                      setEditingRequestId(r.id);
                      setRequestForm({
                        requested_device_type: r.requested_device_type || 'Laptop',
                        specifications: r.specifications || '',
                        remarks: r.reason_for_request || r.remarks || ''
                      });
                      setShowRequestForm(true);
                    }}>
                      <Icon name="edit" />
                    </Button>
                    <Button type="button" variant="ghost" size="sm" className="text-danger" title="Delete Request" onClick={() => deleteRequest(r.id)}>
                      <Icon name="trash" />
                    </Button>
                  </div>
                ])}
                empty="No pending requests."
              />
            </section>

            {/* Request History */}
            <section>
              <h3 style={{ marginBottom: '1rem' }}>Request History</h3>
              <DataTable
                columns={['Device', 'Status', 'Processed At', 'Admin Remarks']}
                rows={myRequests.filter(r => r.status !== 'PENDING').map(r => [
                  <div>
                    <strong>{r.asset_name || r.requested_device_type || r.asset_miczon_id || 'New hardware'}</strong>
                    <br/><small>{r.reason_for_request || r.remarks || 'No reason provided'}</small>
                  </div>,
                  <StatusBadge status={r.status} />,
                  r.processed_at ? new Date(r.processed_at).toLocaleDateString() : '-',
                  r.admin_remarks || '-'
                ])}
                empty="No historical requests."
              />
            </section>
          </div>
          
          <div className="dialog-footer" style={{ marginTop: '1rem' }}>
            <Button type="button" variant="ghost" onClick={() => {
              setRequestsListDialogOpen(false);
              setEditingRequestId(null);
              setShowRequestForm(false);
              setRequestForm({ requested_device_type: 'Laptop', specifications: '', remarks: '' });
            }}>Close</Button>
          </div>
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

function Field({ label, className = '', children }) {
  return (
    <label className={`field ${className}`.trim()}>
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
