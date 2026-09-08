import React, { useState, useEffect, useCallback, useMemo, useRef, useContext } from 'react';
import { Link, Navigate, Route, Routes, useLocation, useNavigate, useParams } from 'react-router-dom';
import { QRCodeCanvas } from 'qrcode.react';
import { UserContext, SuperCategoryContext } from '../lib/contexts';
import { useApi, normalizeList, apiError, getQrPayload, extractMiczonIdFromScan, fetchAll } from '../lib/api';
import { localDate } from '../utils/dates';
import { latestOpenInspection } from '../utils/inspections';
import {
  navItems, emptyAsset, emptyEmployee, assetStatuses,
  getInspectionFields, ratingOptions, inventoryPageSize,
} from '../lib/constants';
import {
  Icon, Button, Select, Dialog, DialogContent, PageHeader, MetricCard,
  DialogHeader, Field, Notice, StatusBadge, DataTable, InspectionFindings,
} from '../components/ui';
import { StockDashboard, StockAdjustments, StockProducts, StockReports } from '../stock/StockModule';
import { AccountsPage } from '../accounts/AccountsModule';

export function SuperCategorySelector({ superCategories, activeSuperCategory, onSelect, className = '' }) {
  if (!superCategories || superCategories.length === 0) return null;

  return (
    <div className={`super-category-selector ${className}`.trim()} style={{ display: 'inline-flex', alignItems: 'center', gap: '8px', background: '#ffffff', padding: '6px 12px', borderRadius: '8px', border: '1px solid #cbd5e1', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
      <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
        <Icon name="layers" /> Category:
      </span>
      <select
        aria-label="Asset super category"
        value={activeSuperCategory?.code || 'it_assets'}
        onChange={(e) => {
          const val = e.target.value;
          if (val === 'all') {
            onSelect({ id: 'all', code: 'all', name: 'All Categories' });
          } else {
            const found = superCategories.find((cat) => cat.code === val || String(cat.id) === val);
            if (found) onSelect(found);
          }
        }}
        style={{ background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', padding: '4px 10px', fontWeight: '700', color: '#0f172a', cursor: 'pointer', outline: 'none' }}
      >
        <option value="all">All Categories</option>
        {superCategories.map((cat) => (
          <option key={cat.id} value={cat.code}>
            {cat.name}
          </option>
        ))}
      </select>
    </div>
  );
}

// Static config (navItems, emptyAsset, emptyEmployee, assetStatuses, inspection-field
// configs, getInspectionFields, ratingOptions, inventoryPageSize) now lives in ./lib/constants

// UI kit (Icon, Button, Select, Dialog, DialogContent, PageHeader, MetricCard,
// DialogHeader, Field, Notice, StatusBadge, DataTable) now lives in ./components/ui

// Shared API helpers (useApi, normalizeList, toApiPath, getQrPayload,
// extractMiczonIdFromScan, fetchAll) now live in ./lib/api

export function AppShell({ token, handleLogout }) {
  const location = useLocation();
  const { user } = useContext(UserContext);
  const api = useApi(token);

  const [superCategories, setSuperCategories] = useState([]);
  const [activeSuperCategory, setActiveSuperCategory] = useState(null);

  useEffect(() => {
    api.get('/super-categories/')
      .then((res) => {
        const list = normalizeList(res.data);
        setSuperCategories(list);
        if (list.length > 0) {
          const defaultCat = list.find((c) => c.code === 'it_assets') || list[0];
          setActiveSuperCategory(defaultCat);
        }
      })
      .catch(() => {});
  }, [api]);

  const superCatContextValue = useMemo(() => ({
    superCategories,
    activeSuperCategory,
    setActiveSuperCategory,
  }), [superCategories, activeSuperCategory]);

  const employeeId = user?.employee_details?.id;
  const warmRoute = useCallback((path) => {
    const categoryCode = activeSuperCategory?.code || 'it_assets';
    let requests = [];
    if (path === '/') requests = [api.get(`/reports/summary/?super_category=${encodeURIComponent(categoryCode)}`)];
    if (path === '/inventory') requests = [
      api.get(`/assets/?page=1&page_size=${inventoryPageSize}&super_category=${encodeURIComponent(categoryCode)}`),
      fetchAll(api, '/employees/'), fetchAll(api, '/departments/'),
    ];
    if (path === '/employees') requests = [fetchAll(api, '/employees/?'), fetchAll(api, '/departments/')];
    if (path === '/requests') requests = [fetchAll(api, '/requests/')];
    if (path === '/health-checks') requests = [
      fetchAll(api, `/health-checks/?super_category=${categoryCode}`),
      api.get(`/reports/health-compliance/?super_category=${categoryCode}`),
    ];
    if (path === '/stock') requests = [api.get('/stock/products/summary/')];
    if (path === '/accounts') requests = [
      api.get(`/accounts/asset-financials/?page=1&page_size=50`),
      fetchAll(api, '/departments/'),
    ];
    if (path === '/portal' && employeeId) requests = [
      api.get(`/employees/${employeeId}/assigned-assets/`),
      fetchAll(api, '/health-checks/'), fetchAll(api, '/requests/'),
    ];
    if (requests.length) Promise.allSettled(requests);
  }, [activeSuperCategory?.code, api, employeeId]);

  return (
    <SuperCategoryContext.Provider value={superCatContextValue}>
      <div className="app-shell">
        <aside className="sidebar">
          <Link className="brand" to={user?.is_superuser ? '/' : '/portal'}>
            <span className="brand-mark">IT</span>
            <span>
              <strong>AssetZone</strong>
              <small>{activeSuperCategory?.name || 'Hardware Inventory'}</small>
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
                <Link
                  key={item.path}
                  className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                  to={item.path}
                  onMouseEnter={() => warmRoute(item.path)}
                  onFocus={() => warmRoute(item.path)}
                  onPointerDown={() => warmRoute(item.path)}
                >
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
              <Route path="/health-checks" element={<HealthChecks key={activeSuperCategory?.code} api={api} isAdmin={true} user={user} />} />
              <Route path="/stock" element={<StockDashboard api={api} />} />
              <Route path="/stock/products" element={<StockProducts api={api} />} />
              <Route path="/stock/adjustments" element={<StockAdjustments api={api} />} />
              <Route path="/stock/reports" element={<StockReports api={api} />} />
              <Route path="/accounts" element={<AccountsPage api={api} />} />
              <Route path="/portal" element={<EmployeePortal api={api} user={user} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          ) : user?.employee_details?.is_manager ? (
            <Routes>
              <Route path="/portal" element={<EmployeePortal api={api} user={user} />} />
              <Route path="/inventory" element={<InventoryPage api={api} isAdmin={false} isManager={true} />} />
              <Route path="/inventory/asset/:assetId" element={<AssetDetailPage api={api} isAdmin={false} />} />
              <Route path="/requests" element={<RequestManager api={api} isAdmin={false} isManager={true} user={user} />} />
              <Route path="/health-checks" element={<HealthChecks key={activeSuperCategory?.code} api={api} isAdmin={false} isManager={true} user={user} />} />
              <Route path="/scan/:miczonId" element={<ScanRedirect api={api} />} />
              <Route path="*" element={<Navigate to="/portal" replace />} />
            </Routes>
          ) : (
            <Routes>
              <Route path="/portal" element={<EmployeePortal api={api} user={user} />} />
              <Route path="/scan/:miczonId" element={<ScanRedirect api={api} />} />
              <Route path="/inventory/asset/:assetId" element={<AssetDetailPage api={api} isAdmin={false} />} />
              <Route path="*" element={<Navigate to="/portal" replace />} />
            </Routes>
          )}
        </main>
      </div>
    </SuperCategoryContext.Provider>
  );
}

export function Dashboard({ api, isAdmin }) {
  const { superCategories, activeSuperCategory, setActiveSuperCategory } = useContext(SuperCategoryContext);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  const catCode = activeSuperCategory?.code || 'it_assets';
  const catName = activeSuperCategory?.name || 'IT Assets';

  useEffect(() => {
    if (!catCode) return;
    api.get(`/reports/summary/?super_category=${encodeURIComponent(catCode)}`)
      .then((res) => setSummary(res.data))
      .catch(() => setError('Unable to load dashboard summary.'));
  }, [api, catCode]);

  const metrics = [
    { label: `Total ${catName}`, value: summary?.total_devices, to: `/inventory?super_category=${catCode}`, tone: 'blue' },
    { label: `Assigned ${catName}`, value: summary?.assigned, to: `/inventory?super_category=${catCode}&status=ASSIGNED`, tone: 'green' },
    { label: `Unassigned ${catName}`, value: summary?.available, to: `/inventory?super_category=${catCode}&status=AVAILABLE`, tone: 'slate' },
    { label: `Repair ${catName}`, value: summary?.repair, to: `/inventory?super_category=${catCode}&status=BROKEN`, tone: 'red' },
    { label: 'Active Requests', value: summary?.active_requests, to: `/requests?super_category=${catCode}`, tone: 'amber' },
    { label: 'Pending Health Checks', value: summary?.pending_health_checks, to: `/health-checks?super_category=${catCode}`, tone: 'violet' },
  ];

  return (
    <>
      <PageHeader eyebrow={isAdmin ? 'Admin Dashboard' : 'Employee Dashboard'} title={`${catName} Overview`}>
        <SuperCategorySelector
          superCategories={superCategories}
          activeSuperCategory={activeSuperCategory}
          onSelect={setActiveSuperCategory}
        />
      </PageHeader>
      {error && <Notice tone="error">{error}</Notice>}
      <div className="metric-grid">
        {metrics.map((metric) => <MetricCard key={metric.label} {...metric} />)}
      </div>
    </>
  );
}

export function InventoryPage({ api, isAdmin }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { superCategories, activeSuperCategory, setActiveSuperCategory } = useContext(SuperCategoryContext);
  const [assets, setAssets] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  
  const paramSuperCategory = new URLSearchParams(location.search).get('super_category');
  const activeCode = paramSuperCategory || activeSuperCategory?.code || 'it_assets';
  const activeCatObj = superCategories.find((c) => c.code === activeCode) || activeSuperCategory;

  // Persisted search/filter/page state (survives navigating to an asset detail and back)
  const FILTERS_KEY = 'inventory:filters';
  const savedFilters = (() => {
    try { return JSON.parse(sessionStorage.getItem(FILTERS_KEY)) || {}; } catch { return {}; }
  })();

  // Search and Filter State
  const [search, setSearch] = useState(savedFilters.search || '');
  const [debouncedSearch, setDebouncedSearch] = useState(savedFilters.search || '');
  const [departmentFilter, setDepartmentFilter] = useState(savedFilters.departmentFilter || '');
  const [statusFilter, setStatusFilter] = useState(new URLSearchParams(location.search).get('status') || savedFilters.statusFilter || '');

  // Pagination State
  const [page, setPage] = useState(savedFilters.page || 1);
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

  // 1. Debounce Search. Only reset to page 1 when the search text actually changes
  // (tracking the previous value keeps a restored page intact on mount, incl. under StrictMode).
  const prevSearch = useRef(search);
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      if (prevSearch.current !== search) {
        setPage(1); // Reset to page 1 on new search
        prevSearch.current = search;
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  // React to external status changes via the URL (?status=...), but only when the URL value
  // truly changes — so returning to this page never clobbers the restored/selected status.
  const prevUrlStatus = useRef(new URLSearchParams(location.search).get('status') || '');
  useEffect(() => {
    const urlStatus = new URLSearchParams(location.search).get('status') || '';
    if (urlStatus !== prevUrlStatus.current) {
      prevUrlStatus.current = urlStatus;
      setStatusFilter(urlStatus);
      setPage(1); // Reset to page 1 on external status filter change
    }
  }, [location.search]);

  // Persist search/filter/page so it can be restored after leaving and returning to this page
  useEffect(() => {
    try {
      sessionStorage.setItem(FILTERS_KEY, JSON.stringify({ search, departmentFilter, statusFilter, page }));
    } catch { /* sessionStorage unavailable — non-fatal */ }
  }, [search, departmentFilter, statusFilter, page]);

  // 2. Load assets with pagination; the request id prevents older responses replacing newer filters.
  const latestAssetRequest = useRef(0);
  const loadAssets = useCallback(() => {
    const requestId = ++latestAssetRequest.current;
    setLoading(true);
    const params = new URLSearchParams({
      page: String(page),
      page_size: String(inventoryPageSize)
    });
    if (activeCode) params.set('super_category', activeCode);
    if (debouncedSearch) params.set('search', debouncedSearch);
    if (statusFilter) params.set('status', statusFilter);
    if (departmentFilter) params.set('department', departmentFilter);

    return api.get(`/assets/?${params.toString()}`)
      .then((res) => {
        if (requestId !== latestAssetRequest.current) return;
        setAssets(normalizeList(res.data));
        setTotalCount(res.data.count || 0);
        setLoading(false);
      })
      .catch(() => {
        if (requestId !== latestAssetRequest.current) return;
        setNotice('Unable to load inventory.');
        setLoading(false);
      });
  }, [api, activeCode, debouncedSearch, statusFilter, departmentFilter, page]);

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
      super_category: form.super_category || activeCatObj?.id || null,
      custodian: form.custodian || null,
      department: form.department || null,
      purchase_date: form.purchase_date || null,
      purchase_price: form.purchase_price === '' ? null : form.purchase_price,
      current_status: form.custodian ? 'ASSIGNED' : form.current_status,
    };

    try {
      if (editingId) {
        await api.patch(`/assets/${editingId}/`, payload);
        setNotice('Asset updated.');
      } else {
        await api.post('/assets/', payload);
        setNotice(isAdmin ? 'Asset added.' : 'Add asset request submitted.');
      }
      closeAssetDialog();
      loadAssets();
    } catch (err) {
      setNotice(apiError(err, 'Unable to save asset.'));
    }
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
    if (activeCode !== 'all') payload.append('super_category', activeCode);
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
      if (activeCode) params.set('super_category', activeCode);
      if (debouncedSearch) params.set('search', debouncedSearch);
      if (statusFilter) params.set('status', statusFilter);
      if (departmentFilter) params.set('department', departmentFilter);

      const response = await api.get(`/assets/export/?${params.toString()}`, { responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a');
      link.href = url;
      link.download = `inventory_export_${localDate()}.xlsx`;
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
      <PageHeader eyebrow="Inventory Register" title={activeCode === 'all' ? 'All Assets' : activeCatObj?.name || 'Assets'}>
        <SuperCategorySelector
          superCategories={superCategories}
          activeSuperCategory={activeSuperCategory}
          onSelect={(sc) => {
            setActiveSuperCategory(sc);
            navigate(`/inventory?super_category=${sc.code}`);
          }}
        />
        <Button type="button" variant="outline" onClick={handleExport}>Download Excel</Button>
        {isAdmin && <Button type="button" variant="outline" onClick={() => setImportDialogOpen(true)}>Import Assets</Button>}
        <Button type="button" variant="outline" onClick={() => setQrLabelsDialogOpen(true)}>QR Labels</Button>
        <Button type="button" variant="primary" onClick={() => {
          setEditingId(null);
          setForm({ ...emptyAsset, super_category: activeCatObj?.id || '' });
          setDialogOpen(true);
        }}>Add Asset</Button>
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
            <h2>{activeCode === 'all' ? 'All Assets' : activeCatObj?.name || 'Assets'}</h2>
            <p className="panel-subtitle">
              {totalCount} item{totalCount === 1 ? '' : 's'} total
            </p>
          </div>
        </div>
        <div className="filter-bar">
          <input aria-label="Search inventory" className="search" placeholder="Search Miczon ID, device, custodian..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
          columns={['Miczon ID', 'Device', 'Super Category', 'Category', 'Department', 'Status', 'Assigned User', 'Actions']}
          rows={assets.map((asset) => [
            asset.miczon_id,
            asset.name,
            <span key="sc" style={{ fontWeight: '600', color: '#0f766e', background: '#ccfbf1', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>
              {asset.super_category_name || 'Uncategorized'}
            </span>,
            asset.category || 'Uncategorized',
            asset.department_name || 'No department',
            <StatusBadge key="sb" status={asset.current_status} />,
            asset.custodian_name || 'Unassigned',
            <div key="act" className="row-actions">
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
          <DialogHeader title={editingId ? 'Edit Asset' : 'Add Asset'} description="Register item with fields used by the asset workflow." />
          <form className="dialog-form" onSubmit={submitAsset}>
            <Field label="Miczon ID"><input required value={form.miczon_id} onChange={(e) => setForm({ ...form, miczon_id: e.target.value })} /></Field>
            <Field label="Device Name"><input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
            <Field label="Super Category">
              <Select value={form.super_category || activeCatObj?.id || ''} onChange={(e) => setForm({ ...form, super_category: e.target.value })}>
                {superCategories.map((sc) => (
                  <option key={sc.id} value={sc.id}>
                    {sc.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Category / Sub-type"><input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. Laptop, Chair, AC, etc." /></Field>
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
            <Field label="Purchase Date"><input type="date" value={form.purchase_date || ''} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></Field>
            <Field label="Purchase Price (PKR)"><input type="number" min="0" step="0.01" value={form.purchase_price ?? ''} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} placeholder="e.g. 45000" /></Field>
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
                  columns={['#', 'Miczon ID', 'Device', 'Purchase', 'Reconciled Custodian', 'Status', 'Messages']}
                  rows={[
                    ...stagingData.map(row => [
                      row.excel_row,
                      <strong>{row.miczon_id}</strong>,
                      row.name,
                      <span style={{ fontSize: '12px', color: '#334155' }}>
                        {row.purchase_price != null && row.purchase_price !== '' ? `Rs ${Number(row.purchase_price).toLocaleString()}` : '—'}
                        {row.purchase_date ? <span style={{ display: 'block', color: '#94a3b8' }}>{row.purchase_date}</span> : null}
                      </span>,
                      <span className="text-success">{row.custodian_name || 'No custodian'}</span>,
                      <StatusBadge status="Ready" />,
                      <span style={{ fontSize: '12px', color: '#64748b' }}>Validated</span>
                    ]),
                    ...stagingErrors.map(row => [
                      row.row,
                      <strong className="text-danger">{row.miczon_id || 'N/A'}</strong>,
                      '-',
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

export function AssetDetailPage({ api, isAdmin }) {
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
      purchase_date: asset.purchase_date || '',
      purchase_price: asset.purchase_price ?? '',
      specifications: asset.specifications || '',
      remarks: asset.remarks || '',
    });
    setDialogOpen(true);
  };

  const removeAsset = async () => {
    if (!window.confirm(`Remove ${asset.name}?`)) return;
    try {
      await api.delete(`/assets/${asset.id}/`);
      navigate('/inventory');
    } catch {
      alert('Unable to remove this asset. Please try again.');
    }
  };

  const submitAsset = async (event) => {
    event.preventDefault();
    const payload = {
      ...form,
      custodian: form.custodian || null,
      department: form.department || null,
      purchase_date: form.purchase_date || null,
      purchase_price: form.purchase_price === '' ? null : form.purchase_price,
      current_status: form.custodian ? 'ASSIGNED' : form.current_status,
    };

    try {
      await api.patch(`/assets/${asset.id}/`, payload);
      setNotice('Hardware updated.');
      setDialogOpen(false);
      api.get(`/assets/${assetId}/`).then((res) => setAsset(res.data));
    } catch (err) {
      setNotice(apiError(err, 'Unable to save hardware.'));
    }
  };

  if (notice && !asset) return <Notice tone="error">{notice}</Notice>;
  if (!asset) return <div className="loading-screen">Loading asset...</div>;

  return (
    <>
      <PageHeader eyebrow="Asset Detail" title={asset.name}>
        <Button type="button" variant="ghost" onClick={() => navigate('/inventory')}>Back</Button>
        {isAdmin && <Button type="button" variant="outline" onClick={editAsset}>Edit</Button>}
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
            <span style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Purchase Date</span>
            <strong style={{ fontSize: '14px', color: '#334155' }}>{asset.purchase_date ? new Date(asset.purchase_date).toLocaleDateString() : '-'}</strong>
          </div>
          <div>
            <span style={{ display: 'block', fontSize: '11px', fontWeight: '700', textTransform: 'uppercase', color: '#64748b' }}>Purchase Price</span>
            <strong style={{ fontSize: '14px', color: '#334155' }}>{asset.purchase_price != null && asset.purchase_price !== '' ? `Rs ${Number(asset.purchase_price).toLocaleString()}` : '-'}</strong>
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
              <InspectionFindings response={asset.latest_inspection} />
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
            <Field label="Purchase Date"><input type="date" value={form.purchase_date || ''} onChange={(e) => setForm({ ...form, purchase_date: e.target.value })} /></Field>
            <Field label="Purchase Price (PKR)"><input type="number" min="0" step="0.01" value={form.purchase_price ?? ''} onChange={(e) => setForm({ ...form, purchase_price: e.target.value })} placeholder="e.g. 45000" /></Field>
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

export function QrLabelsDialog({ open, onClose, onOpenScanner, api }) {
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

export function ScanRedirect({ api }) {
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

export function ScanAssetDialog({ open, onClose, api }) {
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

export function EmployeeDirectory({ api, isAdmin }) {
  // Persisted search/filter (survives leaving and returning to this page)
  const EMP_FILTERS_KEY = 'employees:filters';
  const savedEmpFilters = (() => {
    try { return JSON.parse(sessionStorage.getItem(EMP_FILTERS_KEY)) || {}; } catch { return {}; }
  })();

  const [employees, setEmployees] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [search, setSearch] = useState(savedEmpFilters.search || '');
  const [departmentFilter, setDepartmentFilter] = useState(savedEmpFilters.departmentFilter || '');
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

  // Persist search/filter so it can be restored after leaving and returning to this page
  useEffect(() => {
    try {
      sessionStorage.setItem(EMP_FILTERS_KEY, JSON.stringify({ search, departmentFilter }));
    } catch { /* sessionStorage unavailable — non-fatal */ }
  }, [search, departmentFilter]);

  const loadEmployeeAssets = async (employee) => {
    const res = await api.get(`/employees/${employee.id}/assigned-assets/`);
    const rows = normalizeList(res.data);
    setAssets(rows);
    setSelectedAssetIds(rows.map((asset) => asset.id));
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
          <input aria-label="Search employees" className="search" placeholder="Search name or employee ID..." value={search} onChange={(e) => setSearch(e.target.value)} />
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
              <input aria-label={`Select ${asset.name} (${asset.miczon_id})`} type="checkbox" checked={selectedAssetIds.includes(asset.id)} onChange={() => setSelectedAssetIds((current) => current.includes(asset.id) ? current.filter((id) => id !== asset.id) : [...current, asset.id])} />,
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

export function RequestManager({ api, isAdmin, isManager, user }) {
  const isManagerOrAdmin = isAdmin || isManager || Boolean(user?.employee_details?.is_manager);

  // Persisted status/search filter (survives leaving and returning to this page)
  const REQ_FILTERS_KEY = 'requests:filters';
  const savedReqFilters = (() => {
    try { return JSON.parse(sessionStorage.getItem(REQ_FILTERS_KEY)) || {}; } catch { return {}; }
  })();

  const [requests, setRequests] = useState([]);
  const [notice, setNotice] = useState('');
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [adminRemarkInput, setAdminRemarkInput] = useState('');
  const [statusFilter, setStatusFilter] = useState(savedReqFilters.statusFilter || 'ALL');
  const [searchQuery, setSearchQuery] = useState(savedReqFilters.searchQuery || '');

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

  // Persist status/search filter so it can be restored after leaving and returning to this page
  useEffect(() => {
    try {
      sessionStorage.setItem(REQ_FILTERS_KEY, JSON.stringify({ statusFilter, searchQuery }));
    } catch { /* sessionStorage unavailable — non-fatal */ }
  }, [statusFilter, searchQuery]);

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
      setNotice(apiError(err, 'Unable to fetch employee list.'));
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
    if (customRemarks === undefined) {
      setSelectedRequest(requests.find(req => req.id === id));
      setAdminRemarkInput('');
      return;
    }
    const admin_remarks = customRemarks;
    
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
            aria-label="Search requests" placeholder="Search requester, device..."
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
              <small>{req.submitted_by_name ? `Submitted by: ${req.submitted_by_name}` : 'Submitter not recorded'}</small>
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

export function HealthChecks({ api, isAdmin, isManager, user }) {
  const canInspectTeam = isAdmin || isManager || Boolean(user?.employee_details?.is_manager);
  const { superCategories, activeSuperCategory, setActiveSuperCategory } = useContext(SuperCategoryContext);
  const activeCode = activeSuperCategory?.code || 'it_assets';
  const activeCatName = activeSuperCategory?.name || 'IT Assets';

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

  // Inspection Report Dialog State
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [modalSessionId, setModalSessionId] = useState('');
  const [modalResponses, setModalResponses] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalSearch, setModalSearch] = useState('');
  const [modalDeptFilter, setModalDeptFilter] = useState('');

  const load = useCallback(() => {
    const reportPath = selectedSession 
      ? `/reports/health-compliance/?session=${selectedSession}&super_category=${activeCode}` 
      : `/reports/health-compliance/?super_category=${activeCode}`;
    Promise.all([
      fetchAll(api, `/health-checks/?super_category=${activeCode}`), 
      api.get(reportPath)
    ]).then(([sessionRows, reportRes]) => {
      setSessions(sessionRows);
      setReport(reportRes.data);
      if (!selectedSession && reportRes.data.session?.id) {
        setSelectedSession(String(reportRes.data.session.id));
      }
    });
  }, [api, selectedSession, activeCode]);

  useEffect(() => {
    load();
  }, [load]);

  const openReportModal = () => {
    const targetSession = selectedSession || (sessions[0]?.id ? String(sessions[0].id) : '');
    setModalSessionId(targetSession);
    setModalSearch('');
    setModalDeptFilter('');
    setModalLoading(true);
    setReportModalOpen(true);
  };

  useEffect(() => {
    if (reportModalOpen && modalSessionId) {
      api.get(`/reports/health-compliance/?session=${modalSessionId}`)
        .then((res) => setModalResponses(res.data?.responses || []))
        .catch(() => setNotice('Unable to load inspection responses.'))
        .finally(() => setModalLoading(false));
    }
  }, [api, reportModalOpen, modalSessionId]);

  const trigger = async () => {
    const res = await api.post('/health-checks/trigger-global/', {
      super_category: activeSuperCategory?.id || activeCode
    });
    setNotice(`Monthly inspection started for ${activeCatName} (${res.data.assigned_assets || 0} item(s)).`);
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
      setNotice(apiError(err, 'Unable to fetch pending assets for employee.'));
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
      const fields = getInspectionFields(asset, activeCode);
      const values = adminHealthForm[asset.id] || {};
      const inspectionValues = Object.fromEntries(
        fields.map((field) => [field.name, values[field.name] || field.defaultValue])
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
      setNotice(apiError(err, 'Unable to save health check responses.'));
    }
  };

  const downloadExcelModal = async () => {
    if (!modalSessionId) return;
    try {
      const params = new URLSearchParams({
        session: modalSessionId,
        type: 'all',
      });
      if (modalSearch.trim()) params.set('search', modalSearch.trim());
      if (modalDeptFilter) params.set('department', modalDeptFilter);

      const response = await api.get(`/reports/export-health-responses/?${params.toString()}`, {
        responseType: 'blob',
      });
      const contentDisposition = response.headers['content-disposition'];
      const fileName = contentDisposition?.match(/filename="?([^"]+)"?/)?.[1] || `health_report_session_${modalSessionId}.xlsx`;
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch {
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
    ...modalResponses.map((row) => row.department).filter(Boolean),
  ])).sort((a, b) => a.localeCompare(b));

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

  const filteredModalResponses = modalResponses.filter((resp) => {
    if (modalDeptFilter && resp.department !== modalDeptFilter) return false;
    if (modalSearch.trim()) {
      const q = modalSearch.toLowerCase();
      const match = (resp.employee_name || '').toLowerCase().includes(q) ||
                    (resp.employee_code || '').toLowerCase().includes(q) ||
                    (resp.asset_name || '').toLowerCase().includes(q) ||
                    (resp.asset_miczon_id || '').toLowerCase().includes(q) ||
                    (resp.comments || '').toLowerCase().includes(q);
      if (!match) return false;
    }
    return true;
  });

  const openReportView = (view) => {
    setActiveReportView(view);
  };

  const closeReportView = () => {
    setActiveReportView('');
  };

  return (
    <>
      <PageHeader eyebrow={`Monthly ${activeCatName} Inspection`} title={`${activeCatName} Inspection Report`}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <SuperCategorySelector
            superCategories={superCategories}
            activeSuperCategory={activeSuperCategory}
            onSelect={setActiveSuperCategory}
          />
          <Button type="button" variant="outline" onClick={openReportModal}>
            📊 Inspection Report & Download
          </Button>
          {isAdmin && (
            <Button type="button" variant="primary" onClick={trigger}>
              Start {activeCatName} Inspection
            </Button>
          )}
        </div>
      </PageHeader>
      {notice && <Notice>{notice}</Notice>}

      <section className="panel report-hero">
        <div>
          <p className="panel-subtitle">Current report period</p>
          <h2>{sessionTitle}</h2>
        </div>
        <div className="report-period-control">
          <span>Inspection period</span>
          <Select aria-label="Inspection session" value={selectedSession} onChange={(event) => { setSelectedSession(event.target.value); setReportSearch(''); setReportDepartment(''); }} disabled={sessions.length === 0}>
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
            aria-label="Search inspection report" placeholder="Search employee, asset, ID, department..."
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
            columns={['Asset', 'Employee', 'Inspection Findings', 'Rating']}
            rows={filteredCriticalRows.map((response) => [
              `${response.asset_name} (${response.asset_miczon_id})`,
              response.employee_name,
              <InspectionFindings response={response} />,
              <strong className="text-danger">{response.performance_rating}/5</strong>,
            ])}
            empty="No critical alerts for this inspection."
          />
        </section>
      )}

      {canInspectTeam && adminInspectEmployee && (
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
                          {getInspectionFields(asset, activeCode).map((field) => (
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

      {/* Download Excel & Completed Inspection History Modal */}
      {reportModalOpen && (
        <Dialog open={reportModalOpen}>
          <DialogContent className="inspection-report-dialog">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
              <div>
                <h2 style={{ margin: '0 0 4px', fontSize: '20px', color: '#0f172a', fontWeight: '800' }}>
                  Completed Asset Inspection Report
                </h2>
                <p style={{ margin: 0, fontSize: '13px', color: '#64748b' }}>
                  Select an inspection session from history to view completed asset inspection records, ratings, employee comments, and download the Excel report.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setReportModalOpen(false)}
                aria-label="Close dialog"
                style={{
                  border: 'none',
                  background: '#f1f5f9',
                  color: '#64748b',
                  fontSize: '18px',
                  fontWeight: 'bold',
                  width: '34px',
                  height: '34px',
                  borderRadius: '999px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  lineHeight: '1',
                  transition: 'all 0.15s ease',
                  flexShrink: 0,
                  marginLeft: '12px'
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2'; e.currentTarget.style.color = '#991b1b'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = '#f1f5f9'; e.currentTarget.style.color = '#64748b'; }}
              >
                ✕
              </button>
            </div>

            {/* Filter Controls Row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '14px', margin: '20px 0', alignItems: 'flex-end' }}>
              <Field label="Inspection History Session">
                <Select value={modalSessionId} onChange={(e) => setModalSessionId(e.target.value)}>
                  {sessions.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title} ({new Date(s.created_at).toLocaleDateString()}) — {s.status}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field label="Department">
                <Select value={modalDeptFilter} onChange={(e) => setModalDeptFilter(e.target.value)}>
                  <option value="">All Departments</option>
                  {reportDepartments.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </Select>
              </Field>

              <Field label="Search Records">
                <input
                  type="search"
                  placeholder="Employee, asset ID, comment..."
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                />
              </Field>

              <div>
                <Button type="button" variant="primary" style={{ width: '100%', height: '42px' }} onClick={downloadExcelModal}>
                  📥 Download Excel Report
                </Button>
              </div>
            </div>

            {/* Completed Records Summary Banner */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc', padding: '12px 18px', borderRadius: '8px', border: '1px solid #e2e8f0', marginBottom: '18px' }}>
              <span style={{ fontSize: '14px', color: '#1e293b', fontWeight: '600' }}>
                Showing <strong style={{ color: '#0f766e', fontSize: '15px' }}>{filteredModalResponses.length}</strong> completed asset inspection record(s)
              </span>
              <small style={{ color: '#64748b', fontWeight: '600' }}>
                {modalSessionId ? `Session ID: ${modalSessionId}` : ''}
              </small>
            </div>

            {/* Tabular View (Completed Asset Inspection Records Only) */}
            <div style={{ maxHeight: '520px', overflowY: 'auto', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
              {modalLoading ? (
                <div style={{ padding: '36px', textAlign: 'center', color: '#64748b', fontSize: '15px' }}>Loading inspection records...</div>
              ) : (
                <DataTable
                  columns={['Employee', 'Department', 'Asset & Miczon ID', 'Employee Inspection Comment', 'Rating', 'Conditions', 'Inspection Date']}
                  rows={filteredModalResponses.map((resp) => [
                    <div key="emp" className="employee-cell">
                      <strong style={{ fontSize: '14px', color: '#0f172a' }}>{resp.employee_name}</strong>
                      <small style={{ color: '#64748b' }}>{resp.employee_code || resp.email || 'No ID'}</small>
                    </div>,
                    <span key="dept" style={{ fontWeight: '600', color: '#334155' }}>{resp.department || 'Unassigned'}</span>,
                    <div key="asset">
                      <strong style={{ fontSize: '14px', color: '#0f172a' }}>{resp.asset_name}</strong>
                      <small style={{ display: 'block', color: '#0f766e', fontWeight: '700' }}>{resp.asset_miczon_id}</small>
                    </div>,
                    <div key="comment" style={{ minWidth: '240px', maxWidth: '340px' }}>
                      {resp.comments ? (
                        <div style={{
                          background: '#f0fdf4',
                          borderLeft: '3px solid #0f766e',
                          padding: '8px 12px',
                          borderRadius: '6px',
                          fontSize: '13px',
                          color: '#064e3b',
                          lineHeight: '1.4',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
                        }}>
                          💬 "{resp.comments}"
                        </div>
                      ) : (
                        <div style={{
                          background: '#f8fafc',
                          border: '1px solid #e2e8f0',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          fontSize: '12px',
                          color: '#94a3b8',
                          fontStyle: 'italic',
                          display: 'inline-block'
                        }}>
                          No comments
                        </div>
                      )}
                    </div>,
                    <div key="rating" style={{ whiteSpace: 'nowrap' }}>
                      <span style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '4px 10px',
                        borderRadius: '999px',
                        fontSize: '13px',
                        fontWeight: '700',
                        background: Number(resp.performance_rating) >= 4 ? '#dcfce7' : (Number(resp.performance_rating) === 3 ? '#fef3c7' : '#fee2e2'),
                        color: Number(resp.performance_rating) >= 4 ? '#166534' : (Number(resp.performance_rating) === 3 ? '#92400e' : '#991b1b')
                      }}>
                        {resp.performance_rating} / 5 ⭐
                      </span>
                    </div>,
                    <div key="cond" style={{ fontSize: '12px', display: 'grid', gap: '3px', whiteSpace: 'nowrap' }}>
                      <InspectionFindings response={resp} />
                    </div>,
                    <span key="date" style={{ color: '#64748b', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      {new Date(resp.submitted_at).toLocaleDateString()}
                    </span>,
                  ])}
                  empty="No completed asset inspection records found for this selection."
                />
              )}
            </div>

            <div className="dialog-footer" style={{ marginTop: '20px' }}>
              <Button type="button" variant="ghost" onClick={() => setReportModalOpen(false)}>
                Close
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export function EmployeePortal({ api, user }) {
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
  const [inspectionLoading, setInspectionLoading] = useState(false);

  const loadPortal = useCallback(async () => {
    if (!employee?.id) return;
    const [gearRes, sessionRows, requestsResult] = await Promise.all([
      api.get(`/employees/${employee.id}/assigned-assets/`),
      fetchAll(api, '/health-checks/'),
      fetchAll(api, '/requests/').catch((error) => {
        console.error('Unable to fetch requests:', error);
        return null;
      }),
    ]);
    const latestSession = latestOpenInspection(sessionRows);
    setGear(gearRes.data);
    setSessions(latestSession ? [latestSession] : []);
    if (requestsResult) setMyRequests(requestsResult);

    const latestSessionId = latestSession?.id || '';
    setActiveSession(latestSessionId);
    if (latestSessionId) {
      const pendingRes = await api.get(`/health-checks/${latestSessionId}/pending-assets/`);
      setPendingAssets(normalizeList(pendingRes.data));
    } else {
      setPendingAssets([]);
    }
  }, [api, employee]);

  useEffect(() => {
    // This effect synchronizes the portal with remote API data.
    loadPortal().catch(err => setNotice(apiError(err, 'Unable to load your gear and inspections.')));
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

  const startLatestInspection = async () => {
    if (!employee?.id) return;

    setInspectionLoading(true);
    try {
      const latestSession = latestOpenInspection(await fetchAll(api, '/health-checks/'));
      if (!latestSession) {
        setSessions([]);
        setActiveSession('');
        setPendingAssets([]);
        setNotice('No open monthly inspection is available.');
        return;
      }

      const pendingRes = await api.get(`/health-checks/${latestSession.id}/pending-assets/`);
      const latestPendingAssets = normalizeList(pendingRes.data);
      setSessions([latestSession]);
      setActiveSession(latestSession.id);
      setPendingAssets(latestPendingAssets);
      setHealthForm({});

      if (latestPendingAssets.length === 0) {
        setNotice('You have no outstanding items for the most recent monthly inspection.');
        return;
      }

      setNotice('');
      setInspectionDialogOpen(true);
    } catch (err) {
      setNotice(apiError(err, 'Unable to load the latest monthly inspection.'));
    } finally {
      setInspectionLoading(false);
    }
  };

  const submitHealthBatch = async (event) => {
    event.preventDefault();
    if (!activeSession || pendingAssets.length === 0) return;

    const activeSessionObj = sessions.find((s) => String(s.id) === String(activeSession));
    const responses = pendingAssets.map((asset) => {
      const fields = getInspectionFields(asset, activeSessionObj?.super_category_code);
      const values = healthForm[asset.id] || {};
      const inspectionValues = Object.fromEntries(
        fields.map((field) => [field.name, values[field.name] || field.defaultValue])
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
      setNotice(apiError(err, 'Unable to save health check responses.'));
    }
  };

  const activeSessionTitle = sessions.find((session) => String(session.id) === String(activeSession))?.title || 'Monthly hardware inspection';

  return (
    <>
      <PageHeader eyebrow="Employee Portal" title="My gear and requests">
        {employee && activeSession && pendingAssets.length > 0 && (
          <p className="inspection-required-copy" role="status">Monthly inspection is required</p>
        )}
        <Button type="button" variant="ghost" disabled={!employee || !activeSession || !pendingAssets.length || inspectionLoading} onClick={startLatestInspection}>
          {inspectionLoading ? 'Loading Inspection...' : 'Start Inspection'}
        </Button>
        <Button type="button" variant="primary" disabled={!employee} onClick={() => { setRequestsListDialogOpen(true); setShowRequestForm(false); }}>My Requests</Button>
      </PageHeader>
      {!employee && <Notice tone="error">Your login is not linked to an employee profile yet. Ask an admin to link your user to an employee record before using My Gear, requests, or health checks.</Notice>}
      {notice && <Notice>{notice}</Notice>}

      <section className="panel portal-gear-panel">
        <div className="panel-heading inventory-heading">
          <div>
            <h2>My Gear</h2>
            <p className="panel-subtitle">{gear.length} assigned item(s)</p>
          </div>
          {activeSession && pendingAssets.length > 0 && <StatusBadge status="Inspection Open" />}
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
                        {getInspectionFields(asset, sessions.find((s) => String(s.id) === String(activeSession))?.super_category_code).map((field) => (
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
