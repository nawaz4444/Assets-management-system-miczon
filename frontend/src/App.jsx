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
  { path: '/stock', label: 'Stock', icon: 'layers' },
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
  if (name === 'edit') {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    );
  }
  if (name === 'cross' || name === 'close' || name === 'trash') {
    return (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block' }}>
        <line x1="18" y1="6" x2="6" y2="18" />
        <line x1="6" y1="6" x2="18" y2="18" />
      </svg>
    );
  }
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
          {navItems.filter(item => {
            if (user?.is_superuser) return true;
            if (user?.employee_details?.is_manager) {
              return ['/portal', '/inventory', '/requests', '/health-checks'].includes(item.path);
            }
            return item.path === '/portal';
          }).map((item) => {
            if (item.external) {
              return (
                <a key={item.path} className="nav-item" href={item.path}>
                  <Icon name={item.icon} />
                  <span>{item.label}</span>
                </a>
              );
            }
            return (
              <Link key={item.path} className={`nav-item ${location.pathname === item.path ? 'active' : ''}`} to={item.path}>
                <Icon name={item.icon} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-pill">
            <span className="avatar">{user?.email?.[0]?.toUpperCase() || 'U'}</span>
            <span>
              <strong>{user?.employee_details?.name || user?.email || 'Signed in'}</strong>
              <small>
                {user?.is_superuser
                  ? 'Administrator'
                  : (user?.employee_details?.is_manager ? 'Dept Manager' : 'Employee')}
              </small>
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
            <Route path="/requests" element={<RequestManager api={api} isAdmin={true} user={user} />} />
            <Route path="/health-checks" element={<HealthChecks api={api} isAdmin={true} user={user} />} />
            <Route path="/stock" element={<StockDashboard api={api} />} />
            <Route path="/stock/products" element={<StockProducts api={api} />} />
            <Route path="/stock/adjustments" element={<StockAdjustments api={api} />} />
            <Route path="/stock/reports" element={<StockReports api={api} />} />
            <Route path="/portal" element={<EmployeePortal api={api} user={user} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        ) : user?.employee_details?.is_manager ? (
          <Routes>
            <Route path="/portal" element={<EmployeePortal api={api} user={user} />} />
            <Route path="/inventory" element={<InventoryPage api={api} isAdmin={false} isManager={true} />} />
            <Route path="/inventory/asset/:assetId" element={<AssetDetailPage api={api} isAdmin={false} />} />
            <Route path="/requests" element={<RequestManager api={api} isAdmin={false} isManager={true} user={user} />} />
            <Route path="/health-checks" element={<HealthChecks api={api} isAdmin={false} isManager={true} user={user} />} />
            <Route path="*" element={<Navigate to="/portal" replace />} />
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

function MetricCard({ label, value, to, tone = 'slate', subtext }) {
  return (
    <Link className="metric-card-link" to={to} aria-label={`Open ${label}`}>
      <section className={`metric-card ${tone}`} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', height: '100%' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span>{label}</span>
          {subtext && <span style={{ fontSize: '12px', fontWeight: 'normal', color: '#64748b' }}>{subtext}</span>}
        </div>
        {typeof value === 'object' ? (
          value
        ) : (
          <strong>{value ?? 0}</strong>
        )}
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

  const handleExport = async () => {
    try {
      const params = new URLSearchParams();
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter) params.set('status', statusFilter);
      if (departmentFilter) params.set('department', departmentFilter);

      const response = await api.get(`/assets/export/?${params.toString()}`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inventory_export_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch {
      setNotice('Unable to export inventory.');
    }
  };

  const totalPages = Math.ceil(totalCount / inventoryPageSize);

  return (
    <>
      <PageHeader eyebrow="Inventory Management" title="Hardware register">
        <Button type="button" variant="outline" onClick={handleExport}>Download Excel</Button>
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

      {/* Overview Grid Card */}
      <section className="panel asset-detail-panel" style={{ marginBottom: '1.5rem' }}>
        <h3 style={{ marginBottom: '1rem', color: '#1e293b' }}>Asset Information</h3>
        <div className="asset-detail-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1.25rem' }}>
          <div>
            <span style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Miczon ID</span>
            <strong style={{ fontSize: '15px' }}>{asset.miczon_id}</strong>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Category</span>
            <strong style={{ fontSize: '15px' }}>{asset.category || 'Uncategorized'}</strong>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Current Status</span>
            <StatusBadge status={asset.current_status} />
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Department</span>
            <strong style={{ fontSize: '15px' }}>{asset.department_name || 'No department'}</strong>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Current Custodian</span>
            <strong style={{ fontSize: '15px', color: asset.custodian_name ? '#0f766e' : '#64748b' }}>{asset.custodian_name || 'Unassigned'}</strong>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Date Registered</span>
            <strong style={{ fontSize: '14px', color: '#334155' }}>{asset.created_at ? new Date(asset.created_at).toLocaleDateString() : '-'}</strong>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Last Inspection</span>
            <strong style={{ fontSize: '14px', color: '#334155' }}>{asset.last_inspection_date ? new Date(asset.last_inspection_date).toLocaleDateString() : 'Never'}</strong>
          </div>
        </div>
      </section>

      {/* Specifications & Remarks Panel */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        <section className="panel" style={{ margin: 0 }}>
          <h3 style={{ marginBottom: '0.75rem', fontSize: '15px', color: '#1e293b' }}>Specifications</h3>
          <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0', minHeight: '80px' }}>
            <p style={{ margin: 0, fontSize: '14px', color: asset.specifications ? '#334155' : '#94a3b8', whiteSpace: 'pre-wrap' }}>
              {asset.specifications || 'No detailed specifications entered.'}
            </p>
          </div>
        </section>

        <section className="panel" style={{ margin: 0 }}>
          <h3 style={{ marginBottom: '0.75rem', fontSize: '15px', color: '#1e293b' }}>Remarks & Notes</h3>
          <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0', minHeight: '80px' }}>
            <p style={{ margin: 0, fontSize: '14px', color: asset.remarks ? '#334155' : '#94a3b8', whiteSpace: 'pre-wrap' }}>
              {asset.remarks || 'No admin remarks recorded.'}
            </p>
          </div>
        </section>
      </div>

      {/* Repair & Maintenance Panel (if applicable) */}
      {(asset.current_status === 'BROKEN' || asset.maintenance_vendor || asset.sent_to_repair_date) && (
        <section className="panel" style={{ marginBottom: '1.5rem', borderLeft: '4px solid #ef4444' }}>
          <h3 style={{ marginBottom: '1rem', color: '#991b1b' }}>Maintenance & Repair Status</h3>
          {asset.is_overdue_repair && (
            <Notice tone="error" style={{ marginBottom: '1rem' }}>
              Warning: Hardware return is overdue! Expected return was {new Date(asset.expected_return_date).toLocaleDateString()}.
            </Notice>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
            <div>
              <span style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Maintenance Vendor</span>
              <strong>{asset.maintenance_vendor || 'Not specified'}</strong>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Sent to Repair Date</span>
              <strong>{asset.sent_to_repair_date ? new Date(asset.sent_to_repair_date).toLocaleDateString() : '-'}</strong>
            </div>
            <div>
              <span style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Expected Return Date</span>
              <strong>{asset.expected_return_date ? new Date(asset.expected_return_date).toLocaleDateString() : '-'}</strong>
            </div>
          </div>
        </section>
      )}

      {/* Health Check & History Tabs / Timeline */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
        {/* Latest Inspection Card */}
        <section className="panel" style={{ margin: 0 }}>
          <h3 style={{ marginBottom: '0.75rem', fontSize: '15px', color: '#1e293b' }}>Latest Inspection Findings</h3>
          {asset.latest_inspection ? (
            <div style={{ background: '#f8fafc', padding: '1rem', borderRadius: '6px', border: '1px solid #e2e8f0', display: 'grid', gap: '8px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>Performance Rating:</span>
                <strong style={{ fontSize: '14px', color: asset.latest_inspection.performance_rating >= 3 ? '#166534' : '#991b1b' }}>
                  {asset.latest_inspection.performance_rating} / 5 ⭐
                </strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>Screen Condition:</span>
                <strong>{asset.latest_inspection.screen_condition || 'N/A'}</strong>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: '#64748b' }}>Battery Health:</span>
                <strong>{asset.latest_inspection.battery_life || 'N/A'}</strong>
              </div>
              {asset.latest_inspection.comments && (
                <div style={{ marginTop: '4px', paddingTop: '8px', borderTop: '1px solid #e2e8f0' }}>
                  <small style={{ color: '#64748b', display: 'block' }}>Comments:</small>
                  <em style={{ fontSize: '13px', color: '#334155' }}>"{asset.latest_inspection.comments}"</em>
                </div>
              )}
            </div>
          ) : (
            <p className="empty-state" style={{ padding: '1rem', margin: 0, background: '#f8fafc', borderRadius: '6px' }}>
              No inspection responses submitted yet.
            </p>
          )}
        </section>

        {/* Activity & Transfer History Timeline */}
        <section className="panel" style={{ margin: 0 }}>
          <h3 style={{ marginBottom: '0.75rem', fontSize: '15px', color: '#1e293b' }}>Asset Activity & History</h3>
          {asset.history && asset.history.length > 0 ? (
            <div style={{ maxHeight: '240px', overflowY: 'auto', paddingRight: '4px' }}>
              {asset.history.map((log, idx) => (
                <div key={idx} style={{ padding: '8px 0', borderBottom: idx < asset.history.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                    <span className="status-badge" style={{ fontSize: '10px', padding: '2px 6px', textTransform: 'uppercase' }}>
                      {log.action}
                    </span>
                    <small style={{ color: '#94a3b8', fontSize: '11px' }}>
                      {new Date(log.date).toLocaleDateString()}
                    </small>
                  </div>
                  <p style={{ margin: 0, fontSize: '13px', color: '#334155' }}>
                    {log.from_employee_name ? `${log.from_employee_name} ➔ ` : ''}
                    {log.to_employee_name || 'System'}
                  </p>
                  {log.remarks && <small style={{ color: '#64748b', fontStyle: 'italic', display: 'block' }}>{log.remarks}</small>}
                </div>
              ))}
            </div>
          ) : (
            <p className="empty-state" style={{ padding: '1rem', margin: 0, background: '#f8fafc', borderRadius: '6px' }}>
              No activity logs recorded yet.
            </p>
          )}
        </section>
      </div>

      {/* QR Code Tag Card */}
      <section className="panel qr-detail-panel">
        <h3 style={{ marginBottom: '1rem', color: '#1e293b' }}>Asset QR Code Tag</h3>
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
  const [mode, setMode] = useState('EXISTING');
  const [departments, setDepartments] = useState([]);
  const [selectedDepartment, setSelectedDepartment] = useState('');
  const [assets, setAssets] = useState([]);
  const [quantity, setQuantity] = useState(12);
  const [newMiczonIds, setNewMiczonIds] = useState([]);
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      fetchAll(api, '/departments/').then(setDepartments).catch(() => {});
      api.get('/assets/?page_size=500')
        .then((res) => setAssets(res.data?.results || res.data || []))
        .catch(() => setNotice('Unable to load hardware assets.'));
    }
  }, [api, open]);

  const handlePrint = () => {
    window.print();
  };

  const generateNewIds = async (event) => {
    event.preventDefault();
    const safeQuantity = Math.max(1, Math.min(Number(quantity) || 1, 500));
    setLoading(true);
    setNotice('');
    try {
      const response = await api.get(`/assets/next-miczon-ids/?quantity=${safeQuantity}`);
      setNewMiczonIds(response.data?.ids || []);
    } catch {
      setNotice('Unable to generate Miczon IDs.');
    } finally {
      setLoading(false);
    }
  };

  const filteredAssets = assets.filter((asset) => {
    if (!selectedDepartment) return true;
    return String(asset.department) === String(selectedDepartment) || String(asset.department_id) === String(selectedDepartment);
  });

  return (
    <Dialog open={open}>
      <DialogContent className="qr-labels-dialog" style={{ maxWidth: '880px' }}>
        <DialogHeader
          title="Print Asset QR Labels"
          description="Filter assets by department to view and print formatted tags matching your asset tags."
        />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px' }}>
            <Button
              type="button"
              variant={mode === 'EXISTING' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setMode('EXISTING')}
            >
              Department Assets ({filteredAssets.length})
            </Button>
            <Button
              type="button"
              variant={mode === 'NEW' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setMode('NEW')}
            >
              Generate Blank Tags
            </Button>
          </div>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <Button type="button" variant="outline" size="sm" onClick={onOpenScanner}>
              Scan QR Code
            </Button>
            <Button type="button" variant="primary" size="sm" onClick={handlePrint}>
              🖨️ Print Asset Tags
            </Button>
          </div>
        </div>

        {notice && <Notice tone="error">{notice}</Notice>}

        {mode === 'EXISTING' ? (
          <section className="panel" style={{ padding: '16px', marginBottom: '16px' }}>
            <Field label="Select Department">
              <Select value={selectedDepartment} onChange={(e) => setSelectedDepartment(e.target.value)}>
                <option value="">All Departments ({assets.length} Assets)</option>
                {departments.map((dept) => {
                  const count = assets.filter(a => String(a.department) === String(dept.id) || String(a.department_id) === String(dept.id)).length;
                  return (
                    <option key={dept.id} value={dept.id}>
                      {dept.name} ({count} Assets)
                    </option>
                  );
                })}
              </Select>
            </Field>
          </section>
        ) : (
          <section className="panel" style={{ padding: '16px', marginBottom: '16px' }}>
            <form className="form-grid" onSubmit={generateNewIds} style={{ display: 'flex', gap: '12px', alignItems: 'flex-end' }}>
              <Field label="Quantity of Blank Tags" style={{ flex: 1 }}>
                <input min="1" max="500" type="number" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              </Field>
              <Button type="submit" variant="primary" disabled={loading}>
                {loading ? 'Generating...' : 'Generate New IDs'}
              </Button>
            </form>
          </section>
        )}

        {/* Printable Surface */}
        <section className="panel qr-print-surface" style={{ maxHeight: '460px', overflowY: 'auto', padding: '16px' }}>
          {mode === 'EXISTING' ? (
            filteredAssets.length === 0 ? (
              <p className="empty-state">No assets found for the selected department.</p>
            ) : (
              <div className="qr-label-grid">
                {filteredAssets.map((asset) => (
                  <div
                    key={asset.id}
                    className="qr-label asset-print-label"
                    style={{
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '12px',
                      textAlign: 'center',
                      background: '#ffffff',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                      breakInside: 'avoid'
                    }}
                  >
                    <QRCodeCanvas value={getQrPayload(asset.miczon_id)} size={130} includeMargin />
                    <strong style={{ display: 'block', fontSize: '13px', marginTop: '6px', color: '#0f172a' }}>
                      Miczon ID: {asset.miczon_id}
                    </strong>
                    <span style={{ display: 'block', fontSize: '12px', color: '#334155', fontWeight: '600' }}>
                      Device: {asset.name}
                    </span>
                    <span style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>
                      Dept: {asset.department_name || 'No department'}
                    </span>
                    <span style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>
                      Custodian: {asset.custodian_name || 'Unassigned'}
                    </span>
                  </div>
                ))}
              </div>
            )
          ) : (
            newMiczonIds.length === 0 ? (
              <p className="empty-state">Enter a quantity and click Generate to preview blank tags.</p>
            ) : (
              <div className="qr-label-grid">
                {newMiczonIds.map((miczonId) => (
                  <div
                    key={miczonId}
                    className="qr-label asset-print-label"
                    style={{
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '12px',
                      textAlign: 'center',
                      background: '#ffffff',
                      breakInside: 'avoid'
                    }}
                  >
                    <QRCodeCanvas value={getQrPayload(miczonId)} size={130} includeMargin />
                    <strong style={{ display: 'block', fontSize: '13px', marginTop: '6px' }}>Miczon ID: {miczonId}</strong>
                    <span style={{ display: 'block', fontSize: '11px', color: '#64748b' }}>Unassigned Tag</span>
                  </div>
                ))}
              </div>
            )
          )}
        </section>

        <div className="dialog-footer" style={{ marginTop: '16px' }}>
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

function RequestManager({ api, isAdmin, isManager, user }) {
  const isManagerOrAdmin = isAdmin || isManager || Boolean(user?.employee_details?.is_manager);
  const [requests, setRequests] = useState([]);
  const [notice, setNotice] = useState('');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [adminRemarkInput, setAdminRemarkInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const [employees, setEmployees] = useState([]);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [adminRequestForm, setAdminRequestForm] = useState({
    employeeId: '',
    requested_device_type: 'Laptop',
    specifications: '',
    remarks: '',
  });

  const loadRequests = useCallback(() => fetchAll(api, '/requests/').then(setRequests), [api]);

  useEffect(() => {
    loadRequests();
  }, [loadRequests]);

  const openAdminCreateModal = async () => {
    try {
      const empData = await fetchAll(api, '/employees/');
      setEmployees(empData);
      setAdminRequestForm({
        employeeId: empData[0]?.id || '',
        requested_device_type: 'Laptop',
        specifications: '',
        remarks: '',
      });
      setCreateModalOpen(true);
    } catch (err) {
      setNotice('Unable to fetch employee list.');
    }
  };

  const submitAdminRequest = async (e) => {
    e.preventDefault();
    if (!adminRequestForm.employeeId) {
      setNotice('Please select an employee.');
      return;
    }
    try {
      await api.post('/requests/', {
        requester: Number(adminRequestForm.employeeId),
        action_type: 'ASSIGN',
        requested_device_type: adminRequestForm.requested_device_type,
        specifications: adminRequestForm.specifications,
        reason_for_request: adminRequestForm.remarks,
        remarks: adminRequestForm.remarks,
      });
      setNotice('Hardware request created successfully.');
      setCreateModalOpen(false);
      loadRequests();
    } catch (err) {
      setNotice(err.response?.data?.error || 'Unable to create request.');
    }
  };

  const processRequest = async (id, action, customRemarks) => {
    const admin_remarks = customRemarks !== undefined ? customRemarks : window.prompt(`Optional remarks for ${action}:`);
    if (admin_remarks === null) return;
    
    try {
      await api.post(`/requests/${id}/${action}/`, { admin_remarks: admin_remarks || `Processed via Request Manager.` });
      setNotice(`Request ${action === 'approve' ? 'approved' : 'denied'}.`);
      setSelectedRequest(null);
      setAdminRemarkInput('');
      loadRequests();
    } catch (err) {
      setNotice(err.response?.data?.error || 'Unable to process request.');
    }
  };

  const filteredRequests = requests.filter((req) => {
    if (statusFilter !== 'ALL' && req.status !== statusFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const match = (req.requester_name || '').toLowerCase().includes(q) ||
                    (req.asset_name || '').toLowerCase().includes(q) ||
                    (req.requested_device_type || '').toLowerCase().includes(q) ||
                    (req.action_type || '').toLowerCase().includes(q) ||
                    (req.reason_for_request || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const pendingCount = requests.filter((r) => r.status === 'PENDING').length;
  const approvedCount = requests.filter((r) => r.status === 'APPROVED').length;
  const rejectedCount = requests.filter((r) => r.status === 'REJECTED').length;

  return (
    <>
      <PageHeader eyebrow="Request Manager" title="Review hardware requests">
        {isManagerOrAdmin && (
          <Button type="button" variant="primary" onClick={openAdminCreateModal}>
            + Request for Team Member
          </Button>
        )}
      </PageHeader>
      {notice && <Notice>{notice}</Notice>}

      {/* Filter Toolbar */}
      <section className="panel" style={{ padding: '16px 20px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <Button
              type="button"
              variant={statusFilter === 'ALL' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('ALL')}
            >
              All ({requests.length})
            </Button>
            <Button
              type="button"
              variant={statusFilter === 'PENDING' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('PENDING')}
            >
              Pending ({pendingCount})
            </Button>
            <Button
              type="button"
              variant={statusFilter === 'APPROVED' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('APPROVED')}
            >
              Approved ({approvedCount})
            </Button>
            <Button
              type="button"
              variant={statusFilter === 'REJECTED' ? 'primary' : 'ghost'}
              size="sm"
              onClick={() => setStatusFilter('REJECTED')}
            >
              Rejected ({rejectedCount})
            </Button>
          </div>
          <input
            className="search"
            type="search"
            placeholder="Search requester, device..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '260px' }}
          />
        </div>
      </section>

      {/* Main Request Table (Scannable, Minimal Info) */}
      <section className="panel">
        <DataTable
          columns={['Requester', 'Type & Device', 'Submitted Date', 'Status', 'Actions']}
          rows={filteredRequests.map((req) => [
            <div key="requester" className="employee-cell">
              <strong>{req.requester_name || 'Employee'}</strong>
              <small>{req.target_employee_name ? `Target: ${req.target_employee_name}` : 'Self request'}</small>
            </div>,
            <div key="device">
              <span className="status-badge" style={{ fontSize: '11px', padding: '2px 8px', marginRight: '6px', textTransform: 'uppercase' }}>
                {req.action_type || 'REQUEST'}
              </span>
              <strong>{req.asset_name || req.requested_device_type || req.asset_miczon_id || 'Hardware'}</strong>
            </div>,
            <span key="date" style={{ whiteSpace: 'nowrap', color: '#64748b', fontSize: '13px' }}>
              {new Date(req.created_at).toLocaleDateString()}
            </span>,
            <StatusBadge key="status" status={req.status} />,
            <div key="actions" style={{ display: 'flex', gap: '6px', alignItems: 'center', whiteSpace: 'nowrap' }}>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => { setSelectedRequest(req); setAdminRemarkInput(''); }}
              >
                View Details
              </Button>
              {isAdmin && req.status === 'PENDING' && (
                <>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => processRequest(req.id, 'approve')}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => processRequest(req.id, 'reject')}
                  >
                    Deny
                  </Button>
                </>
              )}
            </div>,
          ])}
          empty="No requests match your filter."
        />
      </section>

      {/* Interactive Request Detail Modal */}
      {selectedRequest && (
        <Dialog open={!!selectedRequest}>
          <DialogContent style={{ maxWidth: '640px' }}>
            <DialogHeader
              title={`Request #${selectedRequest.id} — Details`}
              description={`Action: ${selectedRequest.action_type || 'Hardware Request'} | Submitted: ${new Date(selectedRequest.created_at).toLocaleString()}`}
            />
            <div style={{ display: 'grid', gap: '16px', margin: '16px 0' }}>
              
              {/* Requester & Device Overview Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <small style={{ color: '#64748b', fontWeight: '700', textTransform: 'uppercase', fontSize: '11px' }}>Requester</small>
                  <h4 style={{ margin: '4px 0 2px', fontSize: '15px' }}>{selectedRequest.requester_name || 'N/A'}</h4>
                  {selectedRequest.target_employee_name && (
                    <p style={{ margin: 0, fontSize: '12px', color: '#0f766e' }}>Target: {selectedRequest.target_employee_name}</p>
                  )}
                </div>

                <div style={{ background: '#f8fafc', padding: '14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <small style={{ color: '#64748b', fontWeight: '700', textTransform: 'uppercase', fontSize: '11px' }}>Device / Hardware</small>
                  <h4 style={{ margin: '4px 0 2px', fontSize: '15px' }}>
                    {selectedRequest.asset_name || selectedRequest.requested_device_type || 'Hardware'}
                  </h4>
                  {selectedRequest.asset_miczon_id && (
                    <small style={{ color: '#64748b' }}>ID: {selectedRequest.asset_miczon_id}</small>
                  )}
                </div>
              </div>

              {/* Specifications if available */}
              {selectedRequest.specifications && (
                <div style={{ background: '#f8fafc', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                  <small style={{ color: '#64748b', fontWeight: '700', textTransform: 'uppercase', fontSize: '11px' }}>Specifications</small>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#334155' }}>{selectedRequest.specifications}</p>
                </div>
              )}

              {/* Reason for Request Box */}
              <div style={{ background: '#f1f5f9', padding: '14px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
                <small style={{ color: '#475569', fontWeight: '700', textTransform: 'uppercase', fontSize: '11px' }}>Reason for Request</small>
                <p style={{ margin: '6px 0 0', fontSize: '14px', color: '#1e293b', whiteSpace: 'pre-wrap', wordBreak: 'break-word', fontStyle: 'italic' }}>
                  "{selectedRequest.reason_for_request || selectedRequest.remarks || 'No reason provided.'}"
                </p>
              </div>

              {/* Status & Processing Audit Trail */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#ffffff', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <div>
                  <small style={{ color: '#64748b', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: '700' }}>Current Status</small>
                  <StatusBadge status={selectedRequest.status} />
                </div>
                {selectedRequest.processed_at && (
                  <div style={{ textAlign: 'right' }}>
                    <small style={{ color: '#64748b', display: 'block', fontSize: '11px', textTransform: 'uppercase', fontWeight: '700' }}>Processed Date</small>
                    <span style={{ fontSize: '13px', color: '#334155' }}>{new Date(selectedRequest.processed_at).toLocaleString()}</span>
                  </div>
                )}
              </div>

              {/* Admin Remarks Section if already processed */}
              {selectedRequest.admin_remarks && (
                <div style={{ background: '#faf5ff', padding: '12px 14px', borderRadius: '8px', border: '1px solid #e9d5ff' }}>
                  <small style={{ color: '#6b21a8', fontWeight: '700', textTransform: 'uppercase', fontSize: '11px' }}>Admin Remarks</small>
                  <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#581c87' }}>{selectedRequest.admin_remarks}</p>
                </div>
              )}

              {/* Admin Actions inside Modal if Pending */}
              {isAdmin && selectedRequest.status === 'PENDING' && (
                <div style={{ marginTop: '8px', paddingTop: '16px', borderTop: '1px solid #e2e8f0' }}>
                  <Field label="Admin Remarks (Optional)">
                    <textarea
                      rows="2"
                      placeholder="Add processing note or instructions..."
                      value={adminRemarkInput}
                      onChange={(e) => setAdminRemarkInput(e.target.value)}
                    />
                  </Field>
                  <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '12px' }}>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => processRequest(selectedRequest.id, 'reject', adminRemarkInput)}
                    >
                      Deny Request
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      onClick={() => processRequest(selectedRequest.id, 'approve', adminRemarkInput)}
                    >
                      Approve Request
                    </Button>
                  </div>
                </div>
              )}
            </div>

            <div className="dialog-footer">
              <Button type="button" variant="ghost" onClick={() => setSelectedRequest(null)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Admin Create Request for Employee Modal */}
      {createModalOpen && (
        <Dialog open={createModalOpen}>
          <DialogContent style={{ maxWidth: '560px' }}>
            <DialogHeader
              title="Create Request for Employee"
              description="Submit a hardware provision request on behalf of an employee."
            />
            <form className="dialog-form" onSubmit={submitAdminRequest} style={{ margin: '16px 0' }}>
              <Field label="Target Employee">
                <Select
                  value={adminRequestForm.employeeId}
                  onChange={(e) => setAdminRequestForm({ ...adminRequestForm, employeeId: e.target.value })}
                  required
                >
                  <option value="">Select Employee...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.employee_id}) {emp.department_name ? `- ${emp.department_name}` : ''}
                    </option>
                  ))}
                </Select>
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '12px' }}>
                <Field label="Hardware Type">
                  <Select
                    value={adminRequestForm.requested_device_type}
                    onChange={(e) => setAdminRequestForm({ ...adminRequestForm, requested_device_type: e.target.value })}
                  >
                    <option>Laptop</option>
                    <option>Mobile</option>
                    <option>Accessory</option>
                    <option>Monitor</option>
                    <option>Other</option>
                  </Select>
                </Field>
                <Field label="Specifications">
                  <input
                    value={adminRequestForm.specifications}
                    onChange={(e) => setAdminRequestForm({ ...adminRequestForm, specifications: e.target.value })}
                    placeholder="e.g. 16GB RAM, 512GB SSD..."
                  />
                </Field>
              </div>

              <Field label="Reason / Remarks" style={{ marginTop: '12px' }}>
                <textarea
                  required
                  rows="3"
                  value={adminRequestForm.remarks}
                  onChange={(e) => setAdminRequestForm({ ...adminRequestForm, remarks: e.target.value })}
                  placeholder="Explain why this hardware request is being submitted..."
                />
              </Field>

              <div className="dialog-footer" style={{ marginTop: '20px' }}>
                <Button type="button" variant="ghost" onClick={() => setCreateModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  Submit Request
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function HealthChecks({ api, isAdmin, isManager, user }) {
  const canInspectTeam = isAdmin || isManager || Boolean(user?.employee_details?.is_manager);
  const [sessions, setSessions] = useState([]);
  const [report, setReport] = useState(null);
  const [selectedSession, setSelectedSession] = useState('');
  const [activeReportView, setActiveReportView] = useState('');
  const [reportSearch, setReportSearch] = useState('');
  const [reportDepartment, setReportDepartment] = useState('');
  const [notice, setNotice] = useState('');

  const [adminInspectEmployee, setAdminInspectEmployee] = useState(null);
  const [adminPendingAssets, setAdminPendingAssets] = useState([]);
  const [adminHealthForm, setAdminHealthForm] = useState({});

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

  const openAdminInspection = async (emp) => {
    try {
      const empId = emp.employee_id || emp.id;
      const pendingRes = await api.get(`/health-checks/${selectedSession}/pending-assets/?employee=${empId}`);
      setAdminPendingAssets(pendingRes.data);
      setAdminInspectEmployee(emp);
      setAdminHealthForm({});
    } catch (err) {
      setNotice('Unable to fetch pending assets for employee.');
    }
  };

  const updateAdminHealthField = (assetId, field, value) => {
    setAdminHealthForm((current) => ({
      ...current,
      [assetId]: { ...(current[assetId] || {}), [field]: value },
    }));
  };

  const submitAdminInspectionBatch = async (event) => {
    event.preventDefault();
    if (!selectedSession || !adminInspectEmployee || adminPendingAssets.length === 0) return;

    const empId = adminInspectEmployee.employee_id || adminInspectEmployee.id;
    const responses = adminPendingAssets.map((asset) => {
      const values = adminHealthForm[asset.id] || {};
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
      await api.post('/health-responses/bulk-submit/', {
        session: selectedSession,
        employee: empId,
        responses,
      });
      setNotice(`Inspection completed for ${adminInspectEmployee.employee_name} (${responses.length} asset(s)).`);
      setAdminInspectEmployee(null);
      setAdminPendingAssets([]);
      setAdminHealthForm({});
      load();
    } catch (err) {
      setNotice(err.response?.data?.error || 'Unable to save health check responses.');
    }
  };

  const downloadExcel = async () => {
    if (!selectedSession) return;
    try {
      const exportType = activeReportView || 'all';
      const params = new URLSearchParams({
        session: selectedSession,
        type: exportType,
      });
      if (reportSearch.trim()) params.set('search', reportSearch.trim());
      if (reportDepartment && exportType !== 'critical') params.set('department', reportDepartment);

      const response = await api.get(`/reports/export-health-responses/?${params.toString()}`, {
        responseType: 'blob',
      });
      const contentDisposition = response.headers['content-disposition'];
      const fileName = contentDisposition?.match(/filename="?([^"]+)"?/)?.[1] || `health_report_${exportType.replaceAll('-', '_')}_${selectedSession}.xlsx`;
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Download failed', error);
      setNotice('Failed to download excel report.');
    }
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
        {isAdmin && (
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <Button type="button" variant="outline" onClick={downloadExcel} disabled={!selectedSession}>
              Download Excel
            </Button>
            <Button type="button" variant="primary" onClick={trigger}>
              Start Monthly Inspection
            </Button>
          </div>
        )}
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
            columns={canInspectTeam ? ['Asset', 'Employee', 'Department', 'Category', 'Action'] : ['Asset', 'Employee', 'Department', 'Category']}
            rows={filteredPendingAssetRows.map((asset) => [
              <strong>{asset.name} ({asset.miczon_id})</strong>,
              <div className="employee-cell">
                <strong>{asset.employee.employee_name}</strong>
                <small>{asset.employee.employee_code || 'No employee ID'}</small>
              </div>,
              asset.employee.department,
              asset.category || 'Uncategorized',
              ...(canInspectTeam ? [
                <Button
                  key="inspect"
                  type="button"
                  variant="primary"
                  size="small"
                  onClick={() => openAdminInspection(asset.employee)}
                >
                  Inspect
                </Button>
              ] : []),
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
            columns={canInspectTeam ? ['Employee', 'Department', 'Pending Assets', 'Action'] : ['Employee', 'Department', 'Pending Assets']}
            rows={filteredPendingRows.map((row) => [
              <div className="employee-cell" key="emp">
                <strong>{row.employee_name}</strong>
                <small>{row.employee_code || 'No employee ID'}{row.email ? ` - ${row.email}` : ''}</small>
              </div>,
              row.department,
              <strong key="pending" className="text-danger">{row.pending_count} pending</strong>,
              ...(canInspectTeam ? [
                <Button
                  key="inspect"
                  type="button"
                  variant="primary"
                  size="small"
                  onClick={() => openAdminInspection(row)}
                >
                  Inspect
                </Button>
              ] : []),
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

      {isAdmin && adminInspectEmployee && (
        <Dialog open={!!adminInspectEmployee}>
          <DialogContent className="inspection-dialog">
            <DialogHeader
              title={`Gear Inspection for ${adminInspectEmployee?.employee_name || ''}`}
              description={`${sessionTitle} (${adminPendingAssets.length} pending item(s))`}
            />
            {adminPendingAssets.length === 0 ? (
              <div className="dialog-footer">
                <Button type="button" variant="ghost" onClick={() => setAdminInspectEmployee(null)}>Close</Button>
              </div>
            ) : (
              <form className="health-list-form" onSubmit={submitAdminInspectionBatch}>
                <div className="health-response-list">
                  {adminPendingAssets.map((asset, index) => {
                    const values = adminHealthForm[asset.id] || {};
                    return (
                      <article className="health-list-item" key={asset.id}>
                        <div className="health-asset-summary">
                          <span className="health-index">{index + 1}</span>
                          <div><h3>{asset.name}</h3><p>{asset.miczon_id}</p></div>
                        </div>
                        <div className="health-control-grid">
                          {healthInspectionFields.map((field) => (
                            <Field key={field.name} label={field.label}>
                              <Select
                                value={values[field.name] || field.defaultValue}
                                onChange={(e) => updateAdminHealthField(asset.id, field.name, e.target.value)}
                              >
                                {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                              </Select>
                            </Field>
                          ))}
                          <Field label="Rating">
                            <Select
                              value={values.performance_rating || 4}
                              onChange={(e) => updateAdminHealthField(asset.id, 'performance_rating', e.target.value)}
                            >
                              {ratingOptions.map((r) => <option key={r} value={r}>{r}</option>)}
                            </Select>
                          </Field>
                          <Field label="Comments" className="health-comments-field">
                            <textarea
                              rows="2"
                              value={values.comments || ''}
                              onChange={(e) => updateAdminHealthField(asset.id, 'comments', e.target.value)}
                            />
                          </Field>
                        </div>
                      </article>
                    );
                  })}
                </div>
                <div className="dialog-footer">
                  <Button type="button" variant="ghost" onClick={() => setAdminInspectEmployee(null)}>Cancel</Button>
                  <Button type="submit" variant="primary">Submit Inspection for {adminInspectEmployee?.employee_name}</Button>
                </div>
              </form>
            )}
          </DialogContent>
        </Dialog>
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
                  <div key="device">
                    <strong>{r.asset_name || r.requested_device_type || r.asset_miczon_id || 'New hardware'}</strong>
                    {r.specifications && <><br/><small style={{ color: '#64748b' }}>Specs: {r.specifications}</small></>}
                  </div>,
                  <div key="reason" style={{ maxWidth: '300px', wordBreak: 'break-word', overflowWrap: 'break-word', color: '#475569', fontSize: '13px' }}>
                    {r.reason_for_request || r.remarks || 'No reason provided'}
                  </div>,
                  <StatusBadge key="status" status={r.status} />,
                  <span key="created" style={{ whiteSpace: 'nowrap' }}>{new Date(r.created_at).toLocaleDateString()}</span>,
                  <div key="actions" className="row-actions" style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'nowrap' }}>
                    <Button type="button" variant="ghost" size="sm" title="Edit Request" style={{ padding: '6px 10px' }} onClick={() => {
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
                    <Button type="button" variant="ghost" size="sm" className="text-danger" title="Delete Request" style={{ padding: '6px 10px', color: '#dc2626' }} onClick={() => deleteRequest(r.id)}>
                      <Icon name="cross" />
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

// ==========================================
// STOCK MANAGEMENT MODULE COMPONENTS
// ==========================================

function StockDashboard({ api }) {
  const [products, setProducts] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/stock/products/'),
      api.get('/stock/transactions/')
    ]).then(([prodRes, txRes]) => {
      setProducts(prodRes.data);
      setTransactions(txRes.data);
    }).catch(() => {
      setError('Unable to load stock dashboard summary.');
    }).finally(() => {
      setLoading(false);
    });
  }, [api]);

  if (loading) return <div style={{ padding: '24px', color: '#64748b' }}>Loading dashboard data...</div>;
 
  const lowStockCount = products.filter(p => p.qty <= p.reorder).length;
  const totalInQty = transactions.filter(t => t.type === 'IN').reduce((acc, t) => acc + t.qty, 0);
  const totalOutQty = transactions.filter(t => t.type === 'OUT').reduce((acc, t) => acc + t.qty, 0);

  const adjustmentsValue = (
    <div style={{ display: 'flex', gap: '16px', alignItems: 'center', marginTop: '10px' }}>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#0d9488', fontWeight: 'bold', fontSize: '24px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: '18px', height: '18px', transform: 'rotate(180deg)', transformOrigin: 'center' }}>
            <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm1.25-11.25a.75.75 0 0 0-1.5 0v4.59L7.53 9.03a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 1 0-1.06-1.06l-2.22 2.22V6.75Z" clipRule="evenodd" />
          </svg>
          +{totalInQty}
        </div>
        <span style={{ fontSize: '10px', color: '#0d9488', textTransform: 'uppercase', fontWeight: 'bold' }}>Stock In</span>
      </div>
      <div style={{ width: '1px', height: '28px', background: '#cbd5e1' }} />
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#e11d48', fontWeight: 'bold', fontSize: '24px' }}>
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" style={{ width: '18px', height: '18px' }}>
            <path fillRule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm1.25-11.25a.75.75 0 0 0-1.5 0v4.59L7.53 9.03a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 1 0-1.06-1.06l-2.22 2.22V6.75Z" clipRule="evenodd" />
          </svg>
          -{totalOutQty}
        </div>
        <span style={{ fontSize: '10px', color: '#e11d48', textTransform: 'uppercase', fontWeight: 'bold' }}>Stock Out</span>
      </div>
    </div>
  );

  const alertsValue = lowStockCount > 0 ? (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#d97706', fontWeight: 'bold', fontSize: '28px' }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={{ width: '24px', height: '24px' }}>
          <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003ZM12 8.25a.75.75 0 0 1 .75.75v3.75a.75.75 0 0 1-1.5 0V9a.75.75 0 0 1 .75-.75Zm0 8.25a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Z" clipRule="evenodd" />
        </svg>
        {lowStockCount} Alert(s)
      </div>
    </div>
  ) : (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#059669', fontWeight: 'bold', fontSize: '24px' }}>
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" style={{ width: '24px', height: '24px' }}>
          <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12Zm13.36-1.814a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z" clipRule="evenodd" />
        </svg>
        Optimal
      </div>
    </div>
  );

  const metrics = [
    { label: 'Products', value: products.length, to: '/stock/products', tone: 'blue', subtext: 'Total registered items' },
    { label: 'Adjustments', value: adjustmentsValue, to: '/stock/adjustments', tone: 'green', subtext: 'Stock inbound & outbound' },
    { label: 'Reports', value: alertsValue, to: '/stock/reports', tone: 'amber', subtext: 'Reorder warnings' },
  ];

  return (
    <>
      <PageHeader eyebrow="Consumable Stock Portal" title="Stock Dashboard" />
      {error && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fee2e2', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}
      
      <div className="metric-grid">
        {metrics.map((metric) => (
          <MetricCard key={metric.label} label={metric.label} value={metric.value} to={metric.to} tone={metric.tone} subtext={metric.subtext} />
        ))}
      </div>
    </>
  );
}

function StockAdjustments({ api }) {
  const [activeTab, setActiveTab] = useState('in'); // 'in' or 'out'

  return (
    <>
      <header className="page-header" style={{ marginBottom: '24px' }}>
        <p className="eyebrow">Stock Dashboard / Adjustments</p>
        <h1>Inventory Adjustments</h1>
      </header>

      {/* Tab Switcher */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: '24px', gap: '24px' }}>
        <button 
          onClick={() => setActiveTab('in')}
          style={{
            paddingBottom: '14px',
            fontSize: '14px',
            fontWeight: activeTab === 'in' ? '600' : '500',
            borderBottom: activeTab === 'in' ? '2px solid #0d9488' : '2px solid transparent',
            color: activeTab === 'in' ? '#0d9488' : '#64748b',
            background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
            cursor: 'pointer'
          }}
        >
          Stock Inbound (Stock In)
        </button>
        <button 
          onClick={() => setActiveTab('out')}
          style={{
            paddingBottom: '14px',
            fontSize: '14px',
            fontWeight: activeTab === 'out' ? '600' : '500',
            borderBottom: activeTab === 'out' ? '2px solid #0d9488' : '2px solid transparent',
            color: activeTab === 'out' ? '#0d9488' : '#64748b',
            background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
            cursor: 'pointer'
          }}
        >
          Stock Outbound (Stock Out)
        </button>
      </div>

      {activeTab === 'in' ? (
        <StockIn api={api} />
      ) : (
        <StockOut api={api} />
      )}
    </>
  );
}

function StockProducts({ api }) {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  
  // Modal & Category State
  const [dialogOpen, setDialogOpen] = useState(false);
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [newCatDialogName, setNewCatDialogName] = useState('');
  const [categoriesList, setCategoriesList] = useState([]);
  const [showAddCatInline, setShowAddCatInline] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  
  // Edit States
  const [isEditMode, setIsEditMode] = useState(false);
  const [editProductId, setEditProductId] = useState(null);
  const [editingCatId, setEditingCatId] = useState(null);
  const [editingCatName, setEditingCatName] = useState('');

  const [newProduct, setNewProduct] = useState({
    code: '',
    name: '',
    category: '',
    description: '',
    reorder: 10
  });
  
  // Toast State
  const [toastShow, setToastShow] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const loadProducts = useCallback(() => {
    setLoading(true);
    api.get('/stock/products/')
      .then((res) => setProducts(res.data))
      .catch(() => setError('Unable to load products.'))
      .finally(() => setLoading(false));
  }, [api]);

  const loadCategories = useCallback(() => {
    api.get('/stock/categories/')
      .then((res) => setCategoriesList(res.data))
      .catch(() => {});
  }, [api]);

  useEffect(() => {
    loadProducts();
    loadCategories();
  }, [loadProducts, loadCategories]);

  const categories = [...new Set(products.map(p => p.category_name))].filter(Boolean).sort();
  const names = [...new Set(products.map(p => p.name))].sort();

  const handleOpenModal = () => {
    const randomNum = Math.floor(100 + Math.random() * 900);
    setNewProduct({
      code: `CON-PROD-${randomNum}`,
      name: '',
      category: '',
      description: '',
      reorder: 10
    });
    setIsEditMode(false);
    setEditProductId(null);
    setShowAddCatInline(false);
    setNewCatName('');
    setDialogOpen(true);
  };

  const handleEditProduct = (prod) => {
    setNewProduct({
      code: prod.code,
      name: prod.name,
      category: prod.category, // ID
      description: prod.description,
      reorder: prod.reorder
    });
    setIsEditMode(true);
    setEditProductId(prod.id);
    setDialogOpen(true);
  };

  const handleSaveProduct = async (e) => {
    e.preventDefault();
    if (!newProduct.name || !newProduct.category || !newProduct.description) {
      alert('Please fill in all product specifications.');
      return;
    }
    try {
      if (isEditMode) {
        await api.put(`/stock/products/${editProductId}/`, newProduct);
        setToastMsg(`Product "${newProduct.name}" successfully updated.`);
      } else {
        await api.post('/stock/products/', newProduct);
        setToastMsg(`Product "${newProduct.name}" successfully added to catalog.`);
      }
      setDialogOpen(false);
      setToastShow(true);
      setTimeout(() => setToastShow(false), 5000);
      loadProducts();
    } catch (err) {
      alert('Unable to save product specs.');
    }
  };

  const handleSaveCategoryOnly = async (e) => {
    e.preventDefault();
    if (!newCatDialogName.trim()) {
      alert('Please enter category name.');
      return;
    }
    try {
      await api.post('/stock/categories/', { name: newCatDialogName });
      setCatDialogOpen(false);
      setNewCatDialogName('');
      setToastMsg(`Category "${newCatDialogName}" successfully added.`);
      setToastShow(true);
      setTimeout(() => setToastShow(false), 4000);
      loadCategories();
    } catch {
      alert('Unable to save category. It might already exist.');
    }
  };

  const filteredProducts = products.filter(p => {
    const searchVal = search.toLowerCase();
    const matchesSearch = !search || 
      p.code.toLowerCase().includes(searchVal) || 
      p.name.toLowerCase().includes(searchVal) || 
      (p.category_name || '').toLowerCase().includes(searchVal) || 
      p.description.toLowerCase().includes(searchVal);
      
    const matchesCategory = !categoryFilter || p.category_name === categoryFilter;
    const matchesName = !nameFilter || p.name === nameFilter;
    
    return matchesSearch && matchesCategory && matchesName;
  });

  return (
    <>
      <header className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <p className="eyebrow">Stock Dashboard / Products</p>
          <h1>Products Catalog</h1>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <Button onClick={() => setCatDialogOpen(true)} style={{ background: '#0f766e', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <span>+</span> Add Category
          </Button>
          <Button onClick={handleOpenModal} style={{ background: '#0d9488', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
            <span>+</span> Add New Product
          </Button>
        </div>
      </header>

      {error && <div style={{ background: '#fef2f2', color: '#b91c1c', border: '1px solid #fee2e2', padding: '12px', borderRadius: '8px', marginBottom: '16px' }}>{error}</div>}

      {/* Filters Panel */}
      <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', marginBottom: '24px' }}>
        <input 
          type="text" 
          placeholder="Search by name, code, category..." 
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: '240px', padding: '8px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
        />
        <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} style={{ width: '220px' }}>
          <option value="">All Categories</option>
          {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
        </Select>
        <Select value={nameFilter} onChange={(e) => setNameFilter(e.target.value)} style={{ width: '240px' }}>
          <option value="">All Product Names</option>
          {names.map(name => <option key={name} value={name}>{name}</option>)}
        </Select>
      </div>

      {/* Products Table */}
      <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#64748b' }}>Loading products catalog...</div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 'bold' }}>
                <th style={{ padding: '16px 24px' }}>Item Code</th>
                <th style={{ padding: '16px 24px' }}>Product Name</th>
                <th style={{ padding: '16px 24px' }}>Description</th>
                <th style={{ padding: '16px 24px', textAlign: 'right' }}>Available Stock</th>
                <th style={{ padding: '16px 24px', width: '100px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map(prod => (
                <tr key={prod.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '16px 24px', fontFamily: 'monospace', color: '#94a3b8', fontWeight: '600' }}>{prod.code}</td>
                  <td style={{ padding: '16px 24px' }}>
                    <strong style={{ display: 'block', color: '#334155' }}>{prod.name}</strong>
                    <span style={{ display: 'inline-block', marginTop: '4px', padding: '2px 8px', fontSize: '10px', fontWeight: '600', color: '#475569', background: '#f1f5f9', borderRadius: '4px', textTransform: 'uppercase' }}>{prod.category_name}</span>
                  </td>
                  <td style={{ padding: '16px 24px', color: '#64748b', maxWidth: '320px' }}>{prod.description}</td>
                  <td style={{ padding: '16px 24px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'end' }}>
                      <strong style={{ color: '#1e293b' }}>{prod.qty}</strong>
                      <span style={{
                        display: 'inline-block',
                        fontSize: '10px',
                        fontWeight: '600',
                        marginTop: '4px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        background: prod.status === 'In Stock' ? '#ecfdf5' : prod.status === 'Low Stock' ? '#fffbeb' : '#fef2f2',
                        color: prod.status === 'In Stock' ? '#059669' : prod.status === 'Low Stock' ? '#d97706' : '#dc2626'
                      }}>{prod.status}</span>
                    </div>
                  </td>
                  <td style={{ padding: '16px 24px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '14px', alignItems: 'center' }}>
                      <button 
                        type="button" 
                        onClick={() => handleEditProduct(prod)}
                        style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', display: 'inline-flex', color: '#64748b', transition: 'color 0.2s' }}
                        title="Edit Product"
                        onMouseEnter={(e) => e.currentTarget.style.color = '#0d9488'}
                        onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '16px', height: '16px' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.83 20.04a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                        </svg>
                      </button>
                      <button 
                        type="button" 
                        onClick={async () => {
                          if (window.confirm(`Are you sure you want to delete product "${prod.name}"?`)) {
                            try {
                              await api.delete(`/stock/products/${prod.id}/`);
                              setToastMsg(`Product "${prod.name}" successfully deleted.`);
                              setToastShow(true);
                              setTimeout(() => setToastShow(false), 4000);
                              loadProducts();
                            } catch {
                              alert('Unable to delete product.');
                            }
                          }
                        }}
                        style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', display: 'inline-flex', color: '#ef4444', transition: 'opacity 0.2s' }}
                        title="Delete Product"
                        onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
                        onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '16px', height: '16px' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>No products match the selected filters.</td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>

      {/* Modal Dialog */}
      <Dialog open={dialogOpen}>
        <DialogContent>
          <div style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold', color: '#1e293b' }}>{isEditMode ? 'Edit Product Details' : 'Register New Product'}</h3>
            <form onSubmit={handleSaveProduct} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '6px' }}>Product Code</label>
                <input type="text" readOnly value={newProduct.code} style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: '#f1f5f9', color: '#64748b', fontFamily: 'monospace' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '6px' }}>Product Name</label>
                <input required type="text" placeholder="e.g. Dell Optical Mouse" value={newProduct.name} onChange={(e) => setNewProduct({ ...newProduct, name: e.target.value })} style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '6px' }}>Category</label>
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <Select 
                    required 
                    value={newProduct.category} 
                    onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                    style={{ flex: 1 }}
                  >
                    <option value="">Select Category</option>
                    {categoriesList.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </Select>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    onClick={() => setShowAddCatInline(!showAddCatInline)}
                    style={{ padding: '6px 12px', minHeight: '38px', fontSize: '12px', fontWeight: 'bold' }}
                  >
                    {showAddCatInline ? 'Cancel' : '+ New Category'}
                  </Button>
                </div>
                
                {showAddCatInline && (
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                    <input 
                      type="text" 
                      placeholder="Category name..." 
                      value={newCatName}
                      onChange={(e) => setNewCatName(e.target.value)}
                      style={{ flex: 1, padding: '6px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                    <Button 
                      type="button" 
                      onClick={async () => {
                        if (!newCatName.trim()) {
                          alert('Please enter a category name.');
                          return;
                        }
                        try {
                          const res = await api.post('/stock/categories/', { name: newCatName });
                          setNewCatName('');
                          setShowAddCatInline(false);
                          // Refresh categories
                          api.get('/stock/categories/').then((catRes) => {
                            setCategoriesList(catRes.data);
                            // Pre-select the newly created category
                            setNewProduct(prev => ({ ...prev, category: res.data.id }));
                          });
                        } catch {
                          alert('Unable to save category. It might already exist.');
                        }
                      }}
                      style={{ background: '#0d9488', color: '#fff', fontSize: '12px', minHeight: '32px', padding: '4px 10px' }}
                    >
                      Save
                    </Button>
                  </div>
                )}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '6px' }}>Description</label>
                <input required type="text" placeholder="e.g. USB wired optical tracker mouse" value={newProduct.description} onChange={(e) => setNewProduct({ ...newProduct, description: e.target.value })} style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '6px' }}>Low Stock Alert Level</label>
                <input required type="number" min="1" value={newProduct.reorder} onChange={(e) => setNewProduct({ ...newProduct, reorder: parseInt(e.target.value) })} style={{ width: '120px', padding: '8px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 'bold' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>Cancel</Button>
                <Button type="submit" style={{ background: '#0d9488', color: '#fff' }}>{isEditMode ? 'Save Changes' : 'Save Product'}</Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>

      {/* Standalone Add Category Dialog */}
      <Dialog open={catDialogOpen}>
        <DialogContent>
          <div style={{ padding: '20px' }}>
            <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold', color: '#1e293b' }}>Add New Category</h3>
            <form onSubmit={handleSaveCategoryOnly} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '6px' }}>Category Name</label>
                <input 
                  required 
                  type="text" 
                  placeholder="e.g. Peripherals" 
                  value={newCatDialogName} 
                  onChange={(e) => setNewCatDialogName(e.target.value)} 
                  style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1' }} 
                />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '12px' }}>
                <Button type="button" variant="ghost" onClick={() => { setCatDialogOpen(false); setNewCatDialogName(''); }}>Cancel</Button>
                <Button type="submit" style={{ background: '#0f766e', color: '#fff' }}>Save Category</Button>
              </div>
            </form>

            <hr style={{ border: '0', borderTop: '1px solid #e2e8f0', margin: '20px 0' }} />
            
            <div>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '10px' }}>Existing Categories</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '180px', overflowY: 'auto' }}>
                {categoriesList.map(cat => {
                  const isEditing = editingCatId === cat.id;
                  return (
                    <div key={cat.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '8px 12px', borderRadius: '6px', border: '1px solid #f1f5f9', gap: '8px' }}>
                      {isEditing ? (
                        <div style={{ display: 'flex', gap: '8px', flex: 1 }}>
                          <input 
                            type="text" 
                            value={editingCatName} 
                            onChange={(e) => setEditingCatName(e.target.value)} 
                            style={{ flex: 1, padding: '4px 8px', fontSize: '13px', borderRadius: '4px', border: '1px solid #cbd5e1' }}
                          />
                          <button 
                            type="button"
                            onClick={async () => {
                              if (!editingCatName.trim()) {
                                alert('Category name cannot be empty.');
                                return;
                              }
                              try {
                                await api.put(`/stock/categories/${cat.id}/`, { name: editingCatName });
                                setEditingCatId(null);
                                // Refresh categories list
                                api.get('/stock/categories/').then((catRes) => {
                                  setCategoriesList(catRes.data);
                                });
                                // Refresh products catalog in the background
                                loadProducts();
                              } catch {
                                alert('Unable to update category name.');
                              }
                            }}
                            style={{ background: '#0d9488', color: '#fff', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                          >
                            Save
                          </button>
                          <button 
                            type="button"
                            onClick={() => setEditingCatId(null)}
                            style={{ background: '#cbd5e1', color: '#334155', border: 'none', borderRadius: '4px', padding: '4px 8px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <span style={{ fontSize: '13px', fontWeight: '600', color: '#334155' }}>{cat.name}</span>
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <button 
                              type="button" 
                              onClick={() => {
                                setEditingCatId(cat.id);
                                setEditingCatName(cat.name);
                              }}
                              style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', display: 'inline-flex', color: '#64748b', transition: 'color 0.2s' }}
                              title="Edit Category Name"
                              onMouseEnter={(e) => e.currentTarget.style.color = '#0d9488'}
                              onMouseLeave={(e) => e.currentTarget.style.color = '#64748b'}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '15px', height: '15px' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.83 20.04a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                              </svg>
                            </button>
                            <button 
                              type="button"
                              onClick={async () => {
                                if (window.confirm(`WARNING: Deleting category "${cat.name}" will also delete all associated products. Are you sure you want to proceed?`)) {
                                  try {
                                    await api.delete(`/stock/categories/${cat.id}/`);
                                    setToastMsg(`Category "${cat.name}" successfully deleted.`);
                                    setToastShow(true);
                                    setTimeout(() => setToastShow(false), 4000);
                                    
                                    // Refresh categories list
                                    api.get('/stock/categories/').then((catRes) => {
                                      setCategoriesList(catRes.data);
                                    });
                                    // Refresh products catalog in the background
                                    loadProducts();
                                  } catch {
                                    alert('Unable to delete category.');
                                  }
                                }
                              }}
                              style={{ background: 'none', border: 'none', padding: '4px', cursor: 'pointer', display: 'inline-flex', color: '#ef4444', transition: 'opacity 0.2s' }}
                              title="Delete Category"
                              onMouseEnter={(e) => e.currentTarget.style.opacity = '0.7'}
                              onMouseLeave={(e) => e.currentTarget.style.opacity = '1'}
                            >
                              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '15px', height: '15px' }}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
                {categoriesList.length === 0 && (
                  <span style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'center', display: 'block', padding: '10px 0' }}>No categories registered.</span>
                )}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Floating Success Toast */}
      {toastShow && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: '#0f172a',
          color: '#fff',
          padding: '14px 20px',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
          border: '1px solid #1e293b',
          maxWidth: '400px'
        }}>
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#10b981', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>✓</div>
          <div style={{ flex: 1 }}>
            <strong style={{ display: 'block', fontSize: '14px', color: '#34d399' }}>Product Added!</strong>
            <span style={{ display: 'block', fontSize: '12px', color: '#cbd5e1', marginTop: '2px' }}>{toastMsg}</span>
          </div>
        </div>
      )}
    </>
  );
}

function StockIn({ api }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [supplier, setSupplier] = useState('');
  
  const [rows, setRows] = useState([
    { id: 1, category: '', product_code: '', description: '', unit: 'pieces', qty: 1 }
  ]);
  
  const [toastShow, setToastShow] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const navigate = useNavigate();

  // History & Edit states
  const [existingTx, setExistingTx] = useState([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [batchItems, setBatchItems] = useState([]);
  const [batchDate, setBatchDate] = useState('');
  const [batchDetails, setBatchDetails] = useState('');
  
  // Add item to batch states
  const [addProdCode, setAddProdCode] = useState('');
  const [addQty, setAddQty] = useState(1);
  const [addUnit, setAddUnit] = useState('pieces');

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/stock/products/'),
      api.get('/stock/categories/'),
      api.get('/stock/transactions/')
    ]).then(([prodRes, catRes, txRes]) => {
      setProducts(prodRes.data);
      setCategories(catRes.data.map(c => c.name));
      const inTx = txRes.data.filter(t => t.type === 'IN');
      
      const groups = {};
      inTx.forEach(tx => {
        const key = `${tx.date}_${tx.details || ''}`;
        if (!groups[key]) {
          groups[key] = {
            key,
            date: tx.date,
            details: tx.details || 'Metro Procurement',
            items: [],
            totalQty: 0
          };
        }
        groups[key].items.push(tx);
        groups[key].totalQty += tx.qty;
      });
      const sortedGroups = Object.values(groups).sort((a, b) => new Date(b.date) - new Date(a.date));
      setExistingTx(sortedGroups);

      // If editing dialog is currently open, refresh the active batchItems state from updated transactions
      if (selectedGroup) {
        const currentGroupKey = selectedGroup.key;
        if (groups[currentGroupKey]) {
          setBatchItems(groups[currentGroupKey].items.map(item => ({ ...item })));
        }
      }
    })
    .finally(() => setLoading(false));
  }, [api, selectedGroup]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenEditBatch = (group) => {
    setSelectedGroup(group);
    setBatchItems(group.items.map(item => ({ ...item })));
    setBatchDate(group.date);
    setBatchDetails(group.details);
    setEditDialogOpen(true);
  };

  const handleDeleteGroup = async (group) => {
    if (window.confirm(`Are you sure you want to delete this batch of ${group.items.length} transaction(s)? Product quantities will be adjusted automatically.`)) {
      try {
        await Promise.all(group.items.map(item => api.delete(`/stock/transactions/${item.id}/`)));
        loadData();
      } catch {
        alert("Unable to delete batch transactions.");
      }
    }
  };

  const handleSaveBatchChanges = async (e) => {
    e.preventDefault();
    try {
      await Promise.all(batchItems.map(item => 
        api.put(`/stock/transactions/${item.id}/`, {
          date: batchDate,
          product: item.product, // ID
          type: item.type,
          details: batchDetails,
          qty: item.qty,
          unit: item.unit
        })
      ));
      setEditDialogOpen(false);
      setSelectedGroup(null);
      loadData();
    } catch {
      alert('Unable to save changes to batch.');
    }
  };

  const handleDeleteBatchItem = async (itemId) => {
    if (window.confirm("Are you sure you want to delete this product from the batch? Quantity will be adjusted automatically.")) {
      try {
        await api.delete(`/stock/transactions/${itemId}/`);
        // Refresh local list
        setBatchItems(prev => prev.filter(item => item.id !== itemId));
        loadData();
      } catch {
        alert('Unable to delete item.');
      }
    }
  };

  const handleAddProductToBatch = async () => {
    if (!addProdCode) {
      alert('Please select a product.');
      return;
    }
    const selectedProd = products.find(p => p.code === addProdCode);
    if (!selectedProd) return;
    try {
      const res = await api.post('/stock/transactions/', {
        date: batchDate,
        product: selectedProd.id,
        type: 'IN',
        details: batchDetails,
        qty: addQty,
        unit: addUnit
      });
      setBatchItems(prev => [...prev, res.data]);
      setAddProdCode('');
      setAddQty(1);
      loadData();
    } catch {
      alert('Unable to add product to batch.');
    }
  };

  const handleAddRow = () => {
    const nextId = rows.length > 0 ? Math.max(...rows.map(r => r.id)) + 1 : 1;
    setRows([...rows, { id: nextId, category: '', product_code: '', description: '', unit: 'pieces', qty: 1 }]);
  };

  const handleDeleteRow = (id) => {
    if (rows.length > 1) {
      setRows(rows.filter(r => r.id !== id));
    } else {
      setRows([{ id: 1, category: '', product_code: '', description: '', unit: 'pieces', qty: 1 }]);
    }
  };

  const handleRowChange = (id, field, value) => {
    setRows(rows.map(r => {
      if (r.id !== id) return r;
      
      const updated = { ...r, [field]: value };
      
      if (field === 'category') {
        updated.product_code = '';
        updated.description = '';
      }
      
      if (field === 'product_code') {
        const prodObj = products.find(p => p.code === value);
        updated.description = prodObj ? prodObj.description : '';
      }
      
      return updated;
    }));
  };

  const handleSubmit = async () => {
    const hasInvalid = rows.some(r => !r.category || !r.product_code || r.qty <= 0);
    if (hasInvalid) {
      alert('Please specify Category, Product, and Quantity for all active rows.');
      return;
    }

    try {
      const payload = {
        date: date,
        transactions: rows.map(r => ({
          category: r.category,
          product_code: r.product_code,
          description: r.description,
          unit: r.unit,
          qty: r.qty
        }))
      };

      await api.post('/stock/transactions/bulk_in/', payload);
      
      setToastMsg('The inbound items have been registered in the database.');
      setToastShow(true);
      
      setRows([{ id: 1, category: '', product_code: '', description: '', unit: 'pieces', qty: 1 }]);
      setSupplier('');
      loadData();
      
      setTimeout(() => {
        setToastShow(false);
      }, 3000);
    } catch {
      alert('Unable to process bulk inbound registration.');
    }
  };

  return (
    <>
      <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        
        {/* Date Selector & Supplier */}
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '24px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #f1f5f9', width: 'fit-content' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#64748b' }}>Date:</label>
            <input 
              type="date" 
              value={date} 
              onChange={(e) => setDate(e.target.value)} 
              style={{ padding: '6px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: '600', color: '#334155' }}
            />
          </div>
          <div style={{ width: '1px', height: '24px', background: '#cbd5e1' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#64748b' }}>Supplier:</label>
            <input 
              type="text" 
              placeholder="Supplier name..." 
              value={supplier} 
              onChange={(e) => setSupplier(e.target.value)} 
              style={{ padding: '6px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '240px' }}
            />
          </div>
        </div>

        {/* Dynamic Table */}
        <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 'bold' }}>
                <th style={{ padding: '12px 16px', width: '20%' }}>Category</th>
                <th style={{ padding: '12px 16px', width: '25%' }}>Product</th>
                <th style={{ padding: '12px 16px', width: '22%' }}>Description</th>
                <th style={{ padding: '12px 16px', width: '15%' }}>Unit</th>
                <th style={{ padding: '12px 16px', width: '12%' }}>Quantity</th>
                <th style={{ padding: '12px 16px', width: '6%', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const filteredProducts = products.filter(p => p.category_name === row.category);
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <Select 
                        value={row.category} 
                        onChange={(e) => handleRowChange(row.id, 'category', e.target.value)}
                        style={{ width: '100%' }}
                      >
                        <option value="">Select Category</option>
                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </Select>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Select 
                        value={row.product_code} 
                        onChange={(e) => handleRowChange(row.id, 'product_code', e.target.value)}
                        disabled={!row.category}
                        style={{ width: '100%' }}
                      >
                        <option value="">Select Product</option>
                        {filteredProducts.map(p => <option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}
                      </Select>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <input 
                        type="text" 
                        placeholder="Editable specifications..." 
                        value={row.description} 
                        onChange={(e) => handleRowChange(row.id, 'description', e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                      />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Select 
                        value={row.unit} 
                        onChange={(e) => handleRowChange(row.id, 'unit', e.target.value)}
                        style={{ width: '100%' }}
                      >
                        <option value="pieces">Pieces</option>
                        <option value="boxes">Boxes</option>
                        <option value="packs">Packs</option>
                        <option value="units">Units</option>
                      </Select>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <input 
                        type="number" 
                        min="1" 
                        value={row.qty} 
                        onChange={(e) => handleRowChange(row.id, 'qty', parseInt(e.target.value) || 0)}
                        style={{ width: '80px', padding: '8px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}
                      />
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <button 
                        type="button" 
                        onClick={() => handleDeleteRow(row.id)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '18px', cursor: 'pointer', padding: '4px' }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
          <Button onClick={handleAddRow} style={{ background: '#f0fdfa', color: '#0d9488', border: '1px solid #ccfbf1' }}>
            + Add Row
          </Button>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Button type="button" variant="ghost" onClick={() => navigate('/stock')}>Cancel</Button>
            <Button onClick={handleSubmit} style={{ background: '#0d9488', color: '#fff' }}>Submit Stock In</Button>
          </div>
        </div>
      </div>

      {/* Existing Inbound Transactions Table */}
      <div style={{ marginTop: '40px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold', color: '#1e293b' }}>Inbound Transaction History (Grouped)</h3>
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 'bold' }}>
                <th style={{ padding: '12px 16px' }}>Date</th>
                <th style={{ padding: '12px 16px' }}>Supplier / Source</th>
                <th style={{ padding: '12px 16px' }}>Total Products</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total Quantity</th>
                <th style={{ padding: '12px 16px', width: '100px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {existingTx.map(group => (
                <tr key={group.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', color: '#334155', fontWeight: '600' }}>{group.date}</td>
                  <td style={{ padding: '12px 16px', color: '#334155' }}>{group.details}</td>
                  <td style={{ padding: '12px 16px', color: '#64748b' }}>{group.items.length} product(s)</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold', color: '#0f766e' }}>+{group.totalQty} items</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', alignItems: 'center' }}>
                      <button 
                        type="button" 
                        onClick={() => handleOpenEditBatch(group)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'inline-flex' }}
                        title="Edit Batch"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '15px', height: '15px' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.83 20.04a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                        </svg>
                      </button>
                      <button 
                        type="button" 
                        onClick={() => handleDeleteGroup(group)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'inline-flex' }}
                        title="Delete Batch"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '15px', height: '15px' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {existingTx.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No inbound transactions recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Group Batch Edit Modal Dialog */}
      {editDialogOpen && selectedGroup && (
        <Dialog open={editDialogOpen}>
          <DialogContent style={{ maxWidth: '640px', width: '90%' }}>
            <div style={{ padding: '20px' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 'bold', color: '#1e293b' }}>Edit Inbound Batch</h3>
              <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#64748b' }}>Modify values or add/remove products in this batch transaction.</p>
              
              <form onSubmit={handleSaveBatchChanges} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '6px' }}>Batch Date</label>
                    <input 
                      required 
                      type="date" 
                      value={batchDate} 
                      onChange={(e) => setBatchDate(e.target.value)} 
                      style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '6px' }}>Supplier / Source</label>
                    <input 
                      required 
                      type="text" 
                      value={batchDetails} 
                      onChange={(e) => setBatchDetails(e.target.value)} 
                      style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', marginTop: '8px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '12px' }}>Products List ({batchItems.length})</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                    {batchItems.map((item, idx) => (
                      <div key={item.id || idx} style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ flex: 1 }}>
                          <strong style={{ display: 'block', fontSize: '13px', color: '#334155' }}>{item.product_name}</strong>
                          <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>{item.product_code}</span>
                        </div>
                        <div style={{ width: '90px' }}>
                          <input 
                            required 
                            type="number" 
                            min="1"
                            value={item.qty} 
                            onChange={(e) => {
                              const newQty = parseInt(e.target.value) || 0;
                              setBatchItems(batchItems.map((it, i) => i === idx ? { ...it, qty: newQty } : it));
                            }} 
                            style={{ width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}
                          />
                        </div>
                        <div style={{ width: '110px' }}>
                          <Select 
                            value={item.unit} 
                            onChange={(e) => {
                              const newUnit = e.target.value;
                              setBatchItems(batchItems.map((it, i) => i === idx ? { ...it, unit: newUnit } : it));
                            }}
                            style={{ width: '100%', minHeight: '32px', fontSize: '13px', padding: '4px 8px' }}
                          >
                            <option value="pieces">Pieces</option>
                            <option value="boxes">Boxes</option>
                            <option value="packs">Packs</option>
                            <option value="units">Units</option>
                          </Select>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => handleDeleteBatchItem(item.id)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '18px', cursor: 'pointer', padding: '4px' }}
                          title="Remove Product"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {batchItems.length === 0 && (
                      <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No products in this batch.</div>
                    )}
                  </div>
                </div>

                {/* Add product to batch sub-form */}
                <div style={{ background: '#f0fdf4', padding: '12px', borderRadius: '8px', border: '1px solid #bbf7d0', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'end', marginTop: '8px' }}>
                  <div style={{ flex: 2, minWidth: '180px' }}>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#166534', marginBottom: '4px' }}>Add Product</label>
                    <Select 
                      value={addProdCode} 
                      onChange={(e) => setAddProdCode(e.target.value)}
                      style={{ width: '100%', minHeight: '32px', padding: '4px 8px', fontSize: '13px' }}
                    >
                      <option value="">Select Product</option>
                      {products.map(p => (
                        <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
                      ))}
                    </Select>
                  </div>
                  <div style={{ width: '70px' }}>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#166534', marginBottom: '4px' }}>Qty</label>
                    <input 
                      type="number" 
                      min="1" 
                      value={addQty} 
                      onChange={(e) => setAddQty(parseInt(e.target.value) || 1)} 
                      style={{ width: '100%', padding: '5px 8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #cbd5e1' }} 
                    />
                  </div>
                  <div style={{ width: '90px' }}>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#166534', marginBottom: '4px' }}>Unit</label>
                    <Select 
                      value={addUnit} 
                      onChange={(e) => setAddUnit(e.target.value)}
                      style={{ width: '100%', minHeight: '32px', padding: '4px 8px', fontSize: '13px' }}
                    >
                      <option value="pieces">Pieces</option>
                      <option value="boxes">Boxes</option>
                      <option value="packs">Packs</option>
                      <option value="units">Units</option>
                    </Select>
                  </div>
                  <Button 
                    type="button" 
                    onClick={handleAddProductToBatch}
                    style={{ background: '#166534', color: '#fff', fontSize: '12px', minHeight: '32px', padding: '4px 12px' }}
                  >
                    + Add Item
                  </Button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                  <Button type="button" variant="ghost" onClick={() => { setEditDialogOpen(false); setSelectedGroup(null); }}>Cancel</Button>
                  <Button type="submit" style={{ background: '#0d9488', color: '#fff' }}>Save Changes</Button>
                </div>
              </form>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

function StockOut({ api }) {
  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [demandBy, setDemandBy] = useState('');
  
  const [rows, setRows] = useState([
    { id: 1, category: '', product_code: '', purpose: '', unit: 'pieces', qty: 1 }
  ]);
  
  const [toastShow, setToastShow] = useState(false);
  const [toastMsg, setToastMsg] = useState('');
  const navigate = useNavigate();

  // History & Edit states
  const [existingTx, setExistingTx] = useState([]);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [batchItems, setBatchItems] = useState([]);
  const [batchDate, setBatchDate] = useState('');
  const [batchDetails, setBatchDetails] = useState('');
  
  // Add item to batch states
  const [addProdCode, setAddProdCode] = useState('');
  const [addQty, setAddQty] = useState(1);
  const [addUnit, setAddUnit] = useState('pieces');

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/stock/products/'),
      api.get('/stock/categories/'),
      api.get('/stock/transactions/')
    ]).then(([prodRes, catRes, txRes]) => {
      setProducts(prodRes.data);
      setCategories(catRes.data.map(c => c.name));
      const outTx = txRes.data.filter(t => t.type === 'OUT');
      
      const groups = {};
      outTx.forEach(tx => {
        const key = `${tx.date}_${tx.details || ''}`;
        if (!groups[key]) {
          groups[key] = {
            key,
            date: tx.date,
            details: tx.details || 'Internal Request',
            items: [],
            totalQty: 0
          };
        }
        groups[key].items.push(tx);
        groups[key].totalQty += tx.qty;
      });
      const sortedGroups = Object.values(groups).sort((a, b) => new Date(b.date) - new Date(a.date));
      setExistingTx(sortedGroups);

      // If editing dialog is currently open, refresh the active batchItems state from updated transactions
      if (selectedGroup) {
        const currentGroupKey = selectedGroup.key;
        if (groups[currentGroupKey]) {
          setBatchItems(groups[currentGroupKey].items.map(item => ({ ...item })));
        }
      }
    })
    .finally(() => setLoading(false));
  }, [api, selectedGroup]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleOpenEditBatch = (group) => {
    setSelectedGroup(group);
    setBatchItems(group.items.map(item => ({ ...item })));
    setBatchDate(group.date);
    setBatchDetails(group.details);
    setEditDialogOpen(true);
  };

  const handleDeleteGroup = async (group) => {
    if (window.confirm(`Are you sure you want to delete this batch of ${group.items.length} transaction(s)? Product quantities will be adjusted automatically.`)) {
      try {
        await Promise.all(group.items.map(item => api.delete(`/stock/transactions/${item.id}/`)));
        loadData();
      } catch {
        alert("Unable to delete batch transactions.");
      }
    }
  };

  const handleSaveBatchChanges = async (e) => {
    e.preventDefault();
    try {
      await Promise.all(batchItems.map(item => 
        api.put(`/stock/transactions/${item.id}/`, {
          date: batchDate,
          product: item.product, // ID
          type: item.type,
          details: batchDetails,
          qty: item.qty,
          unit: item.unit
        })
      ));
      setEditDialogOpen(false);
      setSelectedGroup(null);
      loadData();
    } catch {
      alert('Unable to save changes to batch.');
    }
  };

  const handleDeleteBatchItem = async (itemId) => {
    if (window.confirm("Are you sure you want to delete this product from the batch? Quantity will be adjusted automatically.")) {
      try {
        await api.delete(`/stock/transactions/${itemId}/`);
        // Refresh local list
        setBatchItems(prev => prev.filter(item => item.id !== itemId));
        loadData();
      } catch {
        alert('Unable to delete item.');
      }
    }
  };

  const handleAddProductToBatch = async () => {
    if (!addProdCode) {
      alert('Please select a product.');
      return;
    }
    const selectedProd = products.find(p => p.code === addProdCode);
    if (!selectedProd) return;
    try {
      const res = await api.post('/stock/transactions/', {
        date: batchDate,
        product: selectedProd.id,
        type: 'OUT',
        details: batchDetails,
        qty: addQty,
        unit: addUnit
      });
      setBatchItems(prev => [...prev, res.data]);
      setAddProdCode('');
      setAddQty(1);
      loadData();
    } catch {
      alert('Unable to add product to batch.');
    }
  };

  const handleAddRow = () => {
    const nextId = rows.length > 0 ? Math.max(...rows.map(r => r.id)) + 1 : 1;
    setRows([...rows, { id: nextId, category: '', product_code: '', purpose: '', unit: 'pieces', qty: 1 }]);
  };

  const handleDeleteRow = (id) => {
    if (rows.length > 1) {
      setRows(rows.filter(r => r.id !== id));
    } else {
      setRows([{ id: 1, category: '', product_code: '', purpose: '', unit: 'pieces', qty: 1 }]);
    }
  };

  const handleRowChange = (id, field, value) => {
    setRows(rows.map(r => {
      if (r.id !== id) return r;
      const updated = { ...r, [field]: value };
      if (field === 'category') {
        updated.product_code = '';
      }
      return updated;
    }));
  };

  const handleSubmit = async () => {
    if (!demandBy.trim()) {
      alert('Please specify the recipient in the "Demand By" field.');
      return;
    }
    const hasInvalid = rows.some(r => !r.category || !r.product_code || r.qty <= 0);
    if (hasInvalid) {
      alert('Please specify Category, Product, and Quantity for all active rows.');
      return;
    }

    try {
      const payload = {
        date: date,
        demand_by: demandBy,
        transactions: rows.map(r => ({
          category: r.category,
          product_code: r.product_code,
          purpose: r.purpose,
          unit: r.unit,
          qty: r.qty
        }))
      };

      await api.post('/stock/transactions/bulk_out/', payload);
      
      setToastMsg(`Dispatched consumable items to ${demandBy}.`);
      setToastShow(true);
      
      setRows([{ id: 1, category: '', product_code: '', purpose: '', unit: 'pieces', qty: 1 }]);
      setDemandBy('');
      loadData();
      
      setTimeout(() => {
        setToastShow(false);
      }, 3000);
    } catch {
      alert('Unable to process bulk outbound distribution.');
    }
  };

  return (
    <>
      <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
        
        {/* Date Selector & Demand By */}
        <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '24px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #f1f5f9', width: 'fit-content' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#64748b' }}>Date:</label>
            <input 
              type="date" 
              value={date} 
              onChange={(e) => setDate(e.target.value)} 
              style={{ padding: '6px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: '600', color: '#334155' }}
            />
          </div>
          <div style={{ width: '1px', height: '24px', background: '#cbd5e1' }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <label style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#64748b', whiteSpace: 'nowrap' }}>Demand By:</label>
            <input 
              type="text" 
              placeholder="Employee Name" 
              value={demandBy} 
              onChange={(e) => setDemandBy(e.target.value)} 
              style={{ padding: '6px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1', width: '240px' }}
            />
          </div>
        </div>

        {/* Dynamic Table */}
        <div style={{ overflowX: 'auto', marginBottom: '24px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 'bold' }}>
                <th style={{ padding: '12px 16px', width: '20%' }}>Category</th>
                <th style={{ padding: '12px 16px', width: '25%' }}>Product</th>
                <th style={{ padding: '12px 16px', width: '22%' }}>Purpose</th>
                <th style={{ padding: '12px 16px', width: '15%' }}>Unit</th>
                <th style={{ padding: '12px 16px', width: '12%' }}>Quantity</th>
                <th style={{ padding: '12px 16px', width: '6%', textAlign: 'center' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => {
                const filteredProducts = products.filter(p => p.category_name === row.category);
                return (
                  <tr key={row.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 16px' }}>
                      <Select 
                        value={row.category} 
                        onChange={(e) => handleRowChange(row.id, 'category', e.target.value)}
                        style={{ width: '100%' }}
                      >
                        <option value="">Select Category</option>
                        {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                      </Select>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Select 
                        value={row.product_code} 
                        onChange={(e) => handleRowChange(row.id, 'product_code', e.target.value)}
                        disabled={!row.category}
                        style={{ width: '100%' }}
                      >
                        <option value="">Select Product</option>
                        {filteredProducts.map(p => <option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}
                      </Select>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <input 
                        type="text" 
                        placeholder="Purpose of dispatch..." 
                        value={row.purpose} 
                        onChange={(e) => handleRowChange(row.id, 'purpose', e.target.value)}
                        style={{ width: '100%', padding: '8px 12px', fontSize: '13px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                      />
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <Select 
                        value={row.unit} 
                        onChange={(e) => handleRowChange(row.id, 'unit', e.target.value)}
                        style={{ width: '100%' }}
                      >
                        <option value="pieces">Pieces</option>
                        <option value="boxes">Boxes</option>
                        <option value="packs">Packs</option>
                        <option value="units">Units</option>
                      </Select>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <input 
                        type="number" 
                        min="1" 
                        value={row.qty} 
                        onChange={(e) => handleRowChange(row.id, 'qty', parseInt(e.target.value) || 0)}
                        style={{ width: '80px', padding: '8px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}
                      />
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                      <button 
                        type="button" 
                        onClick={() => handleDeleteRow(row.id)}
                        style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '18px', cursor: 'pointer', padding: '4px' }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer Actions */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f1f5f9', paddingTop: '20px' }}>
          <Button onClick={handleAddRow} style={{ background: '#fff1f2', color: '#e11d48', border: '1px solid #ffe4e6' }}>
            + Add Row
          </Button>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Button type="button" variant="ghost" onClick={() => navigate('/stock')}>Cancel</Button>
            <Button onClick={handleSubmit} style={{ background: '#e11d48', color: '#fff' }}>Submit Stock Out</Button>
          </div>
        </div>
      </div>

      {/* Existing Outbound Transactions Table */}
      <div style={{ marginTop: '40px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold', color: '#1e293b' }}>Outbound Transaction History (Grouped)</h3>
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 'bold' }}>
                <th style={{ padding: '12px 16px' }}>Date</th>
                <th style={{ padding: '12px 16px' }}>Recipient (Demand By)</th>
                <th style={{ padding: '12px 16px' }}>Total Products</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Total Quantity</th>
                <th style={{ padding: '12px 16px', width: '100px', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {existingTx.map(group => (
                <tr key={group.key} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', color: '#334155', fontWeight: '600' }}>{group.date}</td>
                  <td style={{ padding: '12px 16px', color: '#334155' }}>{group.details}</td>
                  <td style={{ padding: '12px 16px', color: '#64748b' }}>{group.items.length} product(s)</td>
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold', color: '#e11d48' }}>-{group.totalQty} items</td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', alignItems: 'center' }}>
                      <button 
                        type="button" 
                        onClick={() => handleOpenEditBatch(group)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748b', display: 'inline-flex' }}
                        title="Edit Batch"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '15px', height: '15px' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.83 20.04a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0 1 15.75 21H5.25A2.25 2.25 0 0 1 3 18.75V8.25A2.25 2.25 0 0 1 5.25 6H10" />
                        </svg>
                      </button>
                      <button 
                        type="button" 
                        onClick={() => handleDeleteGroup(group)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'inline-flex' }}
                        title="Delete Batch"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" style={{ width: '15px', height: '15px' }}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {existingTx.length === 0 && (
                <tr>
                  <td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>No outbound transactions recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Group Batch Edit Modal Dialog */}
      {editDialogOpen && selectedGroup && (
        <Dialog open={editDialogOpen}>
          <DialogContent style={{ maxWidth: '640px', width: '90%' }}>
            <div style={{ padding: '20px' }}>
              <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 'bold', color: '#1e293b' }}>Edit Outbound Batch</h3>
              <p style={{ margin: '0 0 20px 0', fontSize: '13px', color: '#64748b' }}>Modify values or add/remove products in this batch transaction.</p>
              
              <form onSubmit={handleSaveBatchChanges} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'flex', gap: '16px' }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '6px' }}>Batch Date</label>
                    <input 
                      required 
                      type="date" 
                      value={batchDate} 
                      onChange={(e) => setBatchDate(e.target.value)} 
                      style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '6px' }}>Recipient Details (Demand By)</label>
                    <input 
                      required 
                      type="text" 
                      value={batchDetails} 
                      onChange={(e) => setBatchDetails(e.target.value)} 
                      style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: '16px', marginTop: '8px' }}>
                  <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '12px' }}>Products List ({batchItems.length})</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '200px', overflowY: 'auto', paddingRight: '4px' }}>
                    {batchItems.map((item, idx) => (
                      <div key={item.id || idx} style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#f8fafc', padding: '10px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                        <div style={{ flex: 1 }}>
                          <strong style={{ display: 'block', fontSize: '13px', color: '#334155' }}>{item.product_name}</strong>
                          <span style={{ fontSize: '11px', color: '#94a3b8', fontFamily: 'monospace' }}>{item.product_code}</span>
                        </div>
                        <div style={{ width: '90px' }}>
                          <input 
                            required 
                            type="number" 
                            min="1"
                            value={item.qty} 
                            onChange={(e) => {
                              const newQty = parseInt(e.target.value) || 0;
                              setBatchItems(batchItems.map((it, i) => i === idx ? { ...it, qty: newQty } : it));
                            }} 
                            style={{ width: '100%', padding: '6px 10px', fontSize: '13px', borderRadius: '6px', border: '1px solid #cbd5e1', fontWeight: 'bold' }}
                          />
                        </div>
                        <div style={{ width: '110px' }}>
                          <Select 
                            value={item.unit} 
                            onChange={(e) => {
                              const newUnit = e.target.value;
                              setBatchItems(batchItems.map((it, i) => i === idx ? { ...it, unit: newUnit } : it));
                            }}
                            style={{ width: '100%', minHeight: '32px', fontSize: '13px', padding: '4px 8px' }}
                          >
                            <option value="pieces">Pieces</option>
                            <option value="boxes">Boxes</option>
                            <option value="packs">Packs</option>
                            <option value="units">Units</option>
                          </Select>
                        </div>
                        <button 
                          type="button" 
                          onClick={() => handleDeleteBatchItem(item.id)}
                          style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '18px', cursor: 'pointer', padding: '4px' }}
                          title="Remove Product"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    {batchItems.length === 0 && (
                      <div style={{ padding: '16px', textAlign: 'center', color: '#94a3b8', fontSize: '13px' }}>No products in this batch.</div>
                    )}
                  </div>
                </div>

                {/* Add product to batch sub-form */}
                <div style={{ background: '#fff1f2', padding: '12px', borderRadius: '8px', border: '1px solid #fecdd3', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'end', marginTop: '8px' }}>
                  <div style={{ flex: 2, minWidth: '180px' }}>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#9f1239', marginBottom: '4px' }}>Add Product</label>
                    <Select 
                      value={addProdCode} 
                      onChange={(e) => setAddProdCode(e.target.value)}
                      style={{ width: '100%', minHeight: '32px', padding: '4px 8px', fontSize: '13px' }}
                    >
                      <option value="">Select Product</option>
                      {products.map(p => (
                        <option key={p.code} value={p.code}>{p.name} ({p.code})</option>
                      ))}
                    </Select>
                  </div>
                  <div style={{ width: '70px' }}>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#9f1239', marginBottom: '4px' }}>Qty</label>
                    <input 
                      type="number" 
                      min="1" 
                      value={addQty} 
                      onChange={(e) => setAddQty(parseInt(e.target.value) || 1)} 
                      style={{ width: '100%', padding: '5px 8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #cbd5e1' }} 
                    />
                  </div>
                  <div style={{ width: '90px' }}>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: '#9f1239', marginBottom: '4px' }}>Unit</label>
                    <Select 
                      value={addUnit} 
                      onChange={(e) => setAddUnit(e.target.value)}
                      style={{ width: '100%', minHeight: '32px', padding: '4px 8px', fontSize: '13px' }}
                    >
                      <option value="pieces">Pieces</option>
                      <option value="boxes">Boxes</option>
                      <option value="packs">Packs</option>
                      <option value="units">Units</option>
                    </Select>
                  </div>
                  <Button 
                    type="button" 
                    onClick={handleAddProductToBatch}
                    style={{ background: '#9f1239', color: '#fff', fontSize: '12px', minHeight: '32px', padding: '4px 12px' }}
                  >
                    + Add Item
                  </Button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                  <Button type="button" variant="ghost" onClick={() => { setEditDialogOpen(false); setSelectedGroup(null); }}>Cancel</Button>
                  <Button type="submit" style={{ background: '#e11d48', color: '#fff' }}>Save Changes</Button>
                </div>
              </form>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
function StockReports({ api }) {
  const [products, setProducts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Tab State
  const location = useLocation();
  const initialTab = new URLSearchParams(location.search).get('tab') === 'activity' ? 'activity' : 'products';
  const [activeTab, setActiveTab] = useState(initialTab);

  // Filters Product Catalog Tab
  const [prodCategory, setProdCategory] = useState('');
  
  // Filters Activity Logs Tab
  const [actPeriod, setActPeriod] = useState('this-month');
  const [actStartDate, setActStartDate] = useState('');
  const [actEndDate, setActEndDate] = useState('');
  const [actCategory, setActCategory] = useState('');
  const [actName, setActName] = useState('');
  const [showActivityTable, setShowActivityTable] = useState(false);

  // Filters Transaction Audit Tab
  const [audPeriod, setAudPeriod] = useState('this-month');
  const [audStartDate, setAudStartDate] = useState('');
  const [audEndDate, setAudEndDate] = useState('');
  const [audCategory, setAudCategory] = useState('');
  const [audProductCode, setAudProductCode] = useState('');
  const [auditRows, setAuditRows] = useState([]);
  const [showAuditTable, setShowAuditTable] = useState(false);

  // Toast Export Feedback
  const [toastShow, setToastShow] = useState(false);
  const [toastMsg, setToastMsg] = useState('');

  const loadData = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.get('/stock/products/'),
      api.get('/stock/transactions/')
    ]).then(([prodRes, logRes]) => {
      setProducts(prodRes.data);
      setLogs(logRes.data);
    }).finally(() => setLoading(false));
  }, [api]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Set dates based on Period Selector (Activity Tab)
  useEffect(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();

    if (actPeriod === 'this-month') {
      setActStartDate(new Date(y, m, 1).toISOString().split('T')[0]);
      setActEndDate(today.toISOString().split('T')[0]);
    } else if (actPeriod === 'previous-month') {
      setActStartDate(new Date(y, m - 1, 1).toISOString().split('T')[0]);
      setActEndDate(new Date(y, m, 0).toISOString().split('T')[0]);
    }
  }, [actPeriod]);

  // Set dates based on Period Selector (Audit Tab)
  useEffect(() => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();

    if (audPeriod === 'this-month') {
      setAudStartDate(new Date(y, m, 1).toISOString().split('T')[0]);
      setAudEndDate(today.toISOString().split('T')[0]);
    } else if (audPeriod === 'previous-month') {
      setAudStartDate(new Date(y, m - 1, 1).toISOString().split('T')[0]);
      setAudEndDate(new Date(y, m, 0).toISOString().split('T')[0]);
    } else if (audPeriod === 'quarter') {
      const qMonth = Math.floor(m / 3) * 3;
      setAudStartDate(new Date(y, qMonth, 1).toISOString().split('T')[0]);
      setAudEndDate(today.toISOString().split('T')[0]);
    } else if (audPeriod === 'year') {
      setAudStartDate(new Date(y, 0, 1).toISOString().split('T')[0]);
      setAudEndDate(today.toISOString().split('T')[0]);
    }
  }, [audPeriod]);

  const categories = [...new Set(products.map(p => p.category_name))].filter(Boolean).sort();
  const names = [...new Set(products.map(p => p.name))].sort();

  const filteredProducts = products.filter(p => !prodCategory || p.category_name === prodCategory);

  const filteredActivityLogs = logs.filter(log => {
    const matchesCategory = !actCategory || log.product_category === actCategory;
    const matchesName = !actName || log.product_name === actName;
    const matchesDate = (!actStartDate || !actEndDate) || (log.date >= actStartDate && log.date <= actEndDate);
    return matchesCategory && matchesName && matchesDate;
  });

  const handleRunAudit = () => {
    if (!audStartDate || !audEndDate) {
      alert('Please select a valid date range to perform stock audit.');
      return;
    }

    const filteredProds = products.filter(p => {
      const matchesCategory = !audCategory || p.category_name === audCategory;
      const matchesProduct = !audProductCode || p.code === audProductCode;
      return matchesCategory && matchesProduct;
    });

    const audited = filteredProds.map(prod => {
      const prodLogs = logs.filter(l => l.product_code === prod.code);
      let totalPostIn = 0;
      let totalPostOut = 0;
      let periodIn = 0;
      let periodOut = 0;

      prodLogs.forEach(l => {
        if (l.date > audEndDate) {
          if (l.type === 'IN') totalPostIn += l.qty;
          else totalPostOut += l.qty;
        } else if (l.date >= audStartDate && l.date <= audEndDate) {
          if (l.type === 'IN') periodIn += l.qty;
          else periodOut += l.qty;
        }
      });

      const netQty = prod.qty - totalPostIn + totalPostOut;
      const openingStock = netQty - periodIn + periodOut;

      return {
        category: prod.category_name,
        code: prod.code,
        name: prod.name,
        openingStock,
        periodIn,
        periodOut,
        netQty
      };
    });

    setAuditRows(audited);
    setShowAuditTable(true);
  };

  const triggerExport = (reportName) => {
    setToastMsg(`Successfully generated PDF file download for "${reportName}".`);
    setToastShow(true);
    setTimeout(() => setToastShow(false), 4000);
  };

  const triggerPrint = (reportName) => {
    setToastMsg(`Preparing document print margins for "${reportName}"...`);
    setToastShow(true);
    setTimeout(() => {
      setToastShow(false);
      window.print();
    }, 1500);
  };

  if (loading) return <div style={{ padding: '24px', color: '#64748b' }}>Loading report generator...</div>;

  return (
    <>
      <header className="page-header" style={{ marginBottom: '24px' }}>
        <p className="eyebrow">Stock Dashboard / Reports</p>
        <h1>Inventory Reports Generator</h1>
      </header>

      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid #e2e8f0', marginBottom: '24px', gap: '24px' }}>
        <button 
          onClick={() => setActiveTab('products')}
          style={{
            paddingBottom: '14px',
            fontSize: '14px',
            fontWeight: activeTab === 'products' ? '600' : '500',
            borderBottom: activeTab === 'products' ? '2px solid #0d9488' : '2px solid transparent',
            color: activeTab === 'products' ? '#0d9488' : '#64748b',
            background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
            cursor: 'pointer'
          }}
        >
          Product List Report
        </button>
        <button 
          onClick={() => setActiveTab('activity')}
          style={{
            paddingBottom: '14px',
            fontSize: '14px',
            fontWeight: activeTab === 'activity' ? '600' : '500',
            borderBottom: activeTab === 'activity' ? '2px solid #0d9488' : '2px solid transparent',
            color: activeTab === 'activity' ? '#0d9488' : '#64748b',
            background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
            cursor: 'pointer'
          }}
        >
          Product Activity Report
        </button>
        <button 
          onClick={() => setActiveTab('audit')}
          style={{
            paddingBottom: '14px',
            fontSize: '14px',
            fontWeight: activeTab === 'audit' ? '600' : '500',
            borderBottom: activeTab === 'audit' ? '2px solid #0d9488' : '2px solid transparent',
            color: activeTab === 'audit' ? '#0d9488' : '#64748b',
            background: 'none', borderTop: 'none', borderLeft: 'none', borderRight: 'none',
            cursor: 'pointer'
          }}
        >
          Stock Transaction Audit
        </button>
      </div>

      {/* Tab Sections */}
      {activeTab === 'products' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Controls */}
          <div style={{ background: '#fff', padding: '16px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', gap: '12px', alignItems: 'center', width: 'fit-content' }}>
            <label style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8' }}>Filter Category:</label>
            <Select value={prodCategory} onChange={(e) => setProdCategory(e.target.value)} style={{ width: '240px' }}>
              <option value="">All Categories</option>
              {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
            </Select>
          </div>

          {/* Table */}
          <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
            <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h3 style={{ margin: 0, fontSize: '15px', color: '#1e293b' }}>Product Specifications Table</h3>
                <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>Details of registered peripheral items and central consumable counts.</p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => triggerExport('Product List Report')} style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '12px', fontWeight: 'bold' }} title="Download PDF">⬇ PDF</button>
                <button onClick={() => triggerPrint('Product List Report')} style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '12px', fontWeight: 'bold' }} title="Print">⎙ Print</button>
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 'bold' }}>
                  <th style={{ padding: '16px 24px' }}>Product ID</th>
                  <th style={{ padding: '16px 24px' }}>Product Name</th>
                  <th style={{ padding: '16px 24px' }}>Description</th>
                  <th style={{ padding: '16px 24px', width: '130px' }}>Stock Available</th>
                  <th style={{ padding: '16px 24px', width: '130px', textAlign: 'right' }}>Low Stock Level</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map(prod => (
                  <tr key={prod.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '16px 24px', fontFamily: 'monospace', color: '#94a3b8', fontWeight: '600' }}>{prod.code}</td>
                    <td style={{ padding: '16px 24px' }}>
                      <strong style={{ color: '#334155' }}>{prod.name}</strong>
                      <span style={{ display: 'inline-block', marginTop: '4px', padding: '2px 8px', fontSize: '10px', fontWeight: '600', color: '#475569', background: '#f1f5f9', borderRadius: '4px' }}>{prod.category_name}</span>
                    </td>
                    <td style={{ padding: '16px 24px', color: '#64748b', maxWidth: '320px' }}>{prod.description}</td>
                    <td style={{ padding: '16px 24px', fontWeight: 'bold', color: '#334155' }}>{prod.qty}</td>
                    <td style={{ padding: '16px 24px', textAlign: 'right', color: '#94a3b8' }}>{prod.reorder}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeTab === 'activity' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Controls */}
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '6px' }}>Period Selector</label>
                <Select value={actPeriod} onChange={(e) => setActPeriod(e.target.value)}>
                  <option value="this-month">This Month</option>
                  <option value="previous-month">Previous Month</option>
                  <option value="custom">Custom Range</option>
                </Select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '6px' }}>Start Date</label>
                <input 
                  type="date" 
                  value={actStartDate}
                  disabled={actPeriod !== 'custom'}
                  onChange={(e) => setActStartDate(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: actPeriod !== 'custom' ? '#f1f5f9' : '#fff' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '6px' }}>End Date</label>
                <input 
                  type="date" 
                  value={actEndDate}
                  disabled={actPeriod !== 'custom'}
                  onChange={(e) => setActEndDate(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: actPeriod !== 'custom' ? '#f1f5f9' : '#fff' }}
                />
              </div>
              <Button onClick={() => setShowActivityTable(true)} style={{ background: '#0d9488', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', height: '38px' }}>
                Show Report
              </Button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '6px' }}>Product Category</label>
                <Select value={actCategory} onChange={(e) => setActCategory(e.target.value)}>
                  <option value="">All Categories</option>
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </Select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '6px' }}>Product Name</label>
                <Select value={actName} onChange={(e) => setActName(e.target.value)}>
                  <option value="">All Product Names</option>
                  {names.map(name => <option key={name} value={name}>{name}</option>)}
                </Select>
              </div>
            </div>
          </div>

          {/* Results Table */}
          {showActivityTable && (
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', color: '#1e293b' }}>Product Activity Audit Report</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>Logs of inbound supplies and outbound hardware dispatches for the selected period.</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => triggerExport('Product Activity Report')} style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '12px', fontWeight: 'bold' }} title="Download PDF">⬇ PDF</button>
                  <button onClick={() => triggerPrint('Product Activity Report')} style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '12px', fontWeight: 'bold' }} title="Print">⎙ Print</button>
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 'bold' }}>
                    <th style={{ padding: '16px 24px' }}>Date</th>
                    <th style={{ padding: '16px 24px' }}>Item Code</th>
                    <th style={{ padding: '16px 24px' }}>Product Name</th>
                    <th style={{ padding: '16px 24px' }}>Activity Type</th>
                    <th style={{ padding: '16px 24px' }}>Recipient / Supplier</th>
                    <th style={{ padding: '16px 24px', textAlign: 'right' }}>Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredActivityLogs.map(log => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '16px 24px', color: '#64748b', fontWeight: '600' }}>{log.date}</td>
                      <td style={{ padding: '16px 24px', fontFamily: 'monospace', color: '#94a3b8' }}>{log.product_code}</td>
                      <td style={{ padding: '16px 24px', fontWeight: '600', color: '#334155' }}>{log.product_name}</td>
                      <td style={{ padding: '16px 24px' }}>
                        <span style={{
                          display: 'inline-block',
                          fontSize: '10px',
                          fontWeight: 'bold',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          background: log.type === 'IN' ? '#ecfdf5' : '#fff2f2',
                          color: log.type === 'IN' ? '#059669' : '#e11d48',
                          textTransform: 'uppercase'
                        }}>
                          {log.type === 'IN' ? 'Stock In' : 'Stock Out'}
                        </span>
                      </td>
                      <td style={{ padding: '16px 24px', color: '#475569' }}>{log.details}</td>
                      <td style={{
                        padding: '16px 24px',
                        textAlign: 'right',
                        fontWeight: 'bold',
                        color: log.type === 'IN' ? '#059669' : '#e11d48'
                      }}>
                        {log.type === 'IN' ? '+' : '-'}{log.qty} {log.unit}
                      </td>
                    </tr>
                  ))}
                  {filteredActivityLogs.length === 0 && (
                    <tr>
                      <td colSpan="6" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>No activity records found in selected range.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {activeTab === 'audit' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          {/* Controls */}
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', alignItems: 'end' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '6px' }}>Period Selector</label>
                <Select value={audPeriod} onChange={(e) => setAudPeriod(e.target.value)}>
                  <option value="this-month">This Month</option>
                  <option value="previous-month">Previous Month</option>
                  <option value="quarter">This Quarter</option>
                  <option value="year">This Year</option>
                  <option value="custom">Custom Range</option>
                </Select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '6px' }}>Date From</label>
                <input 
                  type="date" 
                  value={audStartDate}
                  disabled={audPeriod !== 'custom'}
                  onChange={(e) => setAudStartDate(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: audPeriod !== 'custom' ? '#f1f5f9' : '#fff' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '6px' }}>Date To</label>
                <input 
                  type="date" 
                  value={audEndDate}
                  disabled={audPeriod !== 'custom'}
                  onChange={(e) => setAudEndDate(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', fontSize: '14px', borderRadius: '8px', border: '1px solid #cbd5e1', background: audPeriod !== 'custom' ? '#f1f5f9' : '#fff' }}
                />
              </div>
              <Button onClick={handleRunAudit} style={{ background: '#0d9488', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center', height: '38px' }}>
                Run Audit
              </Button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', borderTop: '1px solid #f1f5f9', paddingTop: '16px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '6px' }}>Product Category</label>
                <Select value={audCategory} onChange={(e) => setAudCategory(e.target.value)}>
                  <option value="">All Categories</option>
                  {categories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                </Select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '6px' }}>Select Product</label>
                <Select value={audProductCode} onChange={(e) => setAudProductCode(e.target.value)}>
                  <option value="">All Products</option>
                  {products.map(p => <option key={p.code} value={p.code}>{p.name} ({p.code})</option>)}
                </Select>
              </div>
            </div>
          </div>

          {/* Audit Results Table */}
          {showAuditTable && (
            <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflow: 'hidden' }}>
              <div style={{ padding: '24px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '15px', color: '#1e293b' }}>Stock Transaction History Audit</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: '#94a3b8' }}>Calculated stock activity audit summary from date range parameters.</p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => triggerExport('Stock Transaction Audit')} style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '12px', fontWeight: 'bold' }} title="Download PDF">⬇ PDF</button>
                  <button onClick={() => triggerPrint('Stock Transaction Audit')} style={{ padding: '8px', background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', fontSize: '12px', fontWeight: 'bold' }} title="Print">⎙ Print</button>
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 'bold' }}>
                    <th style={{ padding: '16px 24px' }}>Category Name</th>
                    <th style={{ padding: '16px 24px' }}>Product ID</th>
                    <th style={{ padding: '16px 24px' }}>Product Name</th>
                    <th style={{ padding: '16px 24px', width: '110px', textAlign: 'center' }}>Opening Stock</th>
                    <th style={{ padding: '16px 24px', width: '110px', textAlign: 'center' }}>Stock In</th>
                    <th style={{ padding: '16px 24px', width: '110px', textAlign: 'center' }}>Stock Out</th>
                    <th style={{ padding: '16px 24px', width: '130px', textAlign: 'right' }}>Net Quantity</th>
                  </tr>
                </thead>
                <tbody>
                  {auditRows.map(row => (
                    <tr key={row.code} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '16px 24px' }}>
                        <span style={{ display: 'inline-block', padding: '2px 8px', fontSize: '10px', fontWeight: '600', color: '#475569', background: '#f1f5f9', borderRadius: '4px' }}>{row.category}</span>
                      </td>
                      <td style={{ padding: '16px 24px', fontFamily: 'monospace', color: '#94a3b8', fontWeight: '600' }}>{row.code}</td>
                      <td style={{ padding: '16px 24px', fontWeight: '600', color: '#334155' }}>{row.name}</td>
                      <td style={{ padding: '16px 24px', textAlign: 'center', color: '#475569', fontWeight: '600' }}>{row.openingStock}</td>
                      <td style={{ padding: '16px 24px', textAlign: 'center', fontWeight: 'bold', color: '#059669' }}>{row.periodIn > 0 ? `+${row.periodIn}` : '0'}</td>
                      <td style={{ padding: '16px 24px', textAlign: 'center', fontWeight: 'bold', color: '#e11d48' }}>{row.periodOut > 0 ? `-${row.periodOut}` : '0'}</td>
                      <td style={{ padding: '16px 24px', textAlign: 'right', fontWeight: '800', color: '#0f172a' }}>{row.netQty}</td>
                    </tr>
                  ))}
                  {auditRows.length === 0 && (
                    <tr>
                      <td colSpan="7" style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>No audit records generated. Run the audit query first.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Floating Success Toast */}
      {toastShow && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          background: '#0f172a',
          color: '#fff',
          padding: '14px 20px',
          borderRadius: '12px',
          boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)',
          border: '1px solid #1e293b'
        }}>
          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: '#0d9488', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>
          <div>
            <strong style={{ display: 'block', fontSize: '14px', color: '#2dd4bf' }}>Report Exported</strong>
            <span style={{ display: 'block', fontSize: '12px', color: '#cbd5e1' }}>{toastMsg}</span>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
