import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { apiError } from '../lib/api';
import { localDate, reportRange } from '../utils/dates';
import {
  Icon, Button, Select, Dialog, DialogContent, PageHeader, MetricCard,
  DialogHeader, Field, Notice, StatusBadge, DataTable,
} from '../components/ui';

export function StockDashboard({ api }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/stock/products/summary/').then((res) => {
      setSummary(res.data);
    }).catch(() => {
      setError('Unable to load stock dashboard summary.');
    }).finally(() => {
      setLoading(false);
    });
  }, [api]);

  if (loading) return <div style={{ padding: '24px', color: '#64748b' }}>Loading dashboard data...</div>;
 
  const lowStockCount = summary?.low_stock_count || 0;
  const totalInQty = summary?.total_in_qty || 0;
  const totalOutQty = summary?.total_out_qty || 0;

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
    { label: 'Products', value: summary?.product_count || 0, to: '/stock/products', tone: 'blue', subtext: 'Total registered items' },
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

export function StockAdjustments({ api }) {
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

export function StockProducts({ api }) {
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
    // Fetching the catalog synchronizes with an external service.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
      alert(apiError(err, 'Unable to save product specs.'));
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
      <div className="stock-print-surface" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
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

const STOCK_BATCH_CONFIG = {
  IN: {
    txType: 'IN',
    rowField: 'description',
    rowFieldHeader: 'Description',
    rowFieldPlaceholder: 'Editable specifications...',
    autofillDescription: true,
    personKey: 'supplier',
    trimPerson: true,
    requirePerson: false,
    requirePersonMsg: '',
    personLabel: 'Supplier:',
    personPlaceholder: 'Supplier name...',
    fallbackDetails: 'Metro Procurement',
    endpoint: '/stock/transactions/bulk_in/',
    successMsg: () => 'The inbound items have been registered in the database.',
    submitError: 'Unable to process bulk inbound registration.',
    historyTitle: 'Inbound Transaction History (Grouped)',
    personColHeader: 'Supplier / Source',
    qtySign: '+',
    qtyColor: '#0f766e',
    emptyHistory: 'No inbound transactions recorded yet.',
    editTitle: 'Edit Inbound Batch',
    editPersonLabel: 'Supplier / Source',
    addRowBtnStyle: { background: '#f0fdfa', color: '#0d9488', border: '1px solid #ccfbf1' },
    submitBtnStyle: { background: '#0d9488', color: '#fff' },
    submitLabel: 'Submit Stock In',
    addBoxStyle: { background: '#f0fdf4', border: '1px solid #bbf7d0' },
    addBoxLabelColor: '#166534',
    addItemBtnBg: '#166534',
    saveBtnBg: '#0d9488',
  },
  OUT: {
    txType: 'OUT',
    rowField: 'purpose',
    rowFieldHeader: 'Purpose',
    rowFieldPlaceholder: 'Purpose of dispatch...',
    autofillDescription: false,
    personKey: 'demand_by',
    trimPerson: false,
    requirePerson: true,
    requirePersonMsg: 'Please specify the recipient in the "Demand By" field.',
    personLabel: 'Demand By:',
    personPlaceholder: 'Employee Name',
    fallbackDetails: 'Internal Request',
    endpoint: '/stock/transactions/bulk_out/',
    successMsg: (p) => `Dispatched consumable items to ${p}.`,
    submitError: 'Unable to process bulk outbound distribution.',
    historyTitle: 'Outbound Transaction History (Grouped)',
    personColHeader: 'Recipient (Demand By)',
    qtySign: '-',
    qtyColor: '#e11d48',
    emptyHistory: 'No outbound transactions recorded yet.',
    editTitle: 'Edit Outbound Batch',
    editPersonLabel: 'Recipient Details (Demand By)',
    addRowBtnStyle: { background: '#fff1f2', color: '#e11d48', border: '1px solid #ffe4e6' },
    submitBtnStyle: { background: '#e11d48', color: '#fff' },
    submitLabel: 'Submit Stock Out',
    addBoxStyle: { background: '#fff1f2', border: '1px solid #fecdd3' },
    addBoxLabelColor: '#9f1239',
    addItemBtnBg: '#9f1239',
    saveBtnBg: '#e11d48',
  },
};

function StockBatch({ api, mode }) {
  const cfg = STOCK_BATCH_CONFIG[mode];
  const makeRow = (id) => ({ id, category: '', product_code: '', [cfg.rowField]: '', unit: 'pieces', qty: 1 });

  const [products, setProducts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [date, setDate] = useState(localDate());
  const [person, setPerson] = useState('');

  const [rows, setRows] = useState([makeRow(1)]);

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
      api.get(`/stock/transactions/?type=${cfg.txType}`)
    ]).then(([prodRes, catRes, txRes]) => {
      setProducts(prodRes.data);
      setCategories(catRes.data.map(c => c.name));
      const groups = {};
      txRes.data.forEach(tx => {
        const key = `${tx.date}_${tx.details || ''}`;
        if (!groups[key]) {
          groups[key] = {
            key,
            date: tx.date,
            details: tx.details || cfg.fallbackDetails,
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
  }, [api, selectedGroup, cfg.txType, cfg.fallbackDetails]);

  useEffect(() => {
    // loadData refreshes remote stock data and its loading indicator.
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
        await api.post('/stock/transactions/batch-change/', { ids: group.items.map(item => item.id), delete: true });
        loadData();
      } catch (error) {
        alert(apiError(error, 'Unable to delete batch transactions.'));
      }
    }
  };

  const handleSaveBatchChanges = async (e) => {
    e.preventDefault();
    try {
      await api.post('/stock/transactions/batch-change/', { ids: batchItems.map(item => item.id), transactions: batchItems.map(item => ({
          id: item.id,
          date: batchDate,
          product: item.product, // ID
          type: item.type,
          details: batchDetails,
          qty: item.qty,
          unit: item.unit
        })) });
      setEditDialogOpen(false);
      setSelectedGroup(null);
      loadData();
    } catch (error) {
      alert(apiError(error, 'Unable to save changes to batch.'));
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
        type: cfg.txType,
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
    setRows([...rows, makeRow(nextId)]);
  };

  const handleDeleteRow = (id) => {
    if (rows.length > 1) {
      setRows(rows.filter(r => r.id !== id));
    } else {
      setRows([makeRow(1)]);
    }
  };

  const handleRowChange = (id, field, value) => {
    setRows(rows.map(r => {
      if (r.id !== id) return r;

      const updated = { ...r, [field]: value };

      if (field === 'category') {
        updated.product_code = '';
        if (cfg.autofillDescription) updated[cfg.rowField] = '';
      }

      if (cfg.autofillDescription && field === 'product_code') {
        const prodObj = products.find(p => p.code === value);
        updated[cfg.rowField] = prodObj ? prodObj.description : '';
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

    if (cfg.requirePerson && !person.trim()) {
      alert(cfg.requirePersonMsg);
      return;
    }

    try {
      const payload = {
        date: date,
        [cfg.personKey]: cfg.trimPerson ? person.trim() : person,
        transactions: rows.map(r => ({
          category: r.category,
          product_code: r.product_code,
          [cfg.rowField]: r[cfg.rowField],
          unit: r.unit,
          qty: r.qty
        }))
      };

      await api.post(cfg.endpoint, payload);

      setToastMsg(cfg.successMsg(person));
      setToastShow(true);

      setRows([makeRow(1)]);
      setPerson('');
      loadData();

      setTimeout(() => {
        setToastShow(false);
      }, 3000);
    } catch (error) {
      alert(apiError(error, cfg.submitError));
    }
  };

  return (
    <>
      {loading && <Notice>Loading stock transactions…</Notice>}
      {toastShow && <Notice>{toastMsg}</Notice>}
      <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>

        {/* Date Selector & Person */}
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
            <label style={{ fontSize: '12px', fontWeight: 'bold', textTransform: 'uppercase', color: '#64748b', whiteSpace: 'nowrap' }}>{cfg.personLabel}</label>
            <input
              type="text"
              placeholder={cfg.personPlaceholder}
              value={person}
              onChange={(e) => setPerson(e.target.value)}
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
                <th style={{ padding: '12px 16px', width: '22%' }}>{cfg.rowFieldHeader}</th>
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
                        placeholder={cfg.rowFieldPlaceholder}
                        value={row[cfg.rowField]}
                        onChange={(e) => handleRowChange(row.id, cfg.rowField, e.target.value)}
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
          <Button onClick={handleAddRow} style={cfg.addRowBtnStyle}>
            + Add Row
          </Button>
          <div style={{ display: 'flex', gap: '12px' }}>
            <Button type="button" variant="ghost" onClick={() => navigate('/stock')}>Cancel</Button>
            <Button onClick={handleSubmit} style={cfg.submitBtnStyle}>{cfg.submitLabel}</Button>
          </div>
        </div>
      </div>

      {/* Existing Transactions Table */}
      <div style={{ marginTop: '40px' }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold', color: '#1e293b' }}>{cfg.historyTitle}</h3>
        <div className="stock-print-surface" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '14px' }}>
            <thead>
              <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', fontWeight: 'bold' }}>
                <th style={{ padding: '12px 16px' }}>Date</th>
                <th style={{ padding: '12px 16px' }}>{cfg.personColHeader}</th>
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
                  <td style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 'bold', color: cfg.qtyColor }}>{cfg.qtySign}{group.totalQty} items</td>
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
                  <td colSpan="5" style={{ padding: '24px', textAlign: 'center', color: '#94a3b8' }}>{cfg.emptyHistory}</td>
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
              <h3 style={{ margin: '0 0 8px 0', fontSize: '16px', fontWeight: 'bold', color: '#1e293b' }}>{cfg.editTitle}</h3>
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
                    <label style={{ display: 'block', fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', color: '#94a3b8', marginBottom: '6px' }}>{cfg.editPersonLabel}</label>
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
                <div style={{ ...cfg.addBoxStyle, padding: '12px', borderRadius: '8px', display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'end', marginTop: '8px' }}>
                  <div style={{ flex: 2, minWidth: '180px' }}>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: cfg.addBoxLabelColor, marginBottom: '4px' }}>Add Product</label>
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
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: cfg.addBoxLabelColor, marginBottom: '4px' }}>Qty</label>
                    <input
                      type="number"
                      min="1"
                      value={addQty}
                      onChange={(e) => setAddQty(parseInt(e.target.value) || 1)}
                      style={{ width: '100%', padding: '5px 8px', fontSize: '13px', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                    />
                  </div>
                  <div style={{ width: '90px' }}>
                    <label style={{ display: 'block', fontSize: '10px', fontWeight: 'bold', textTransform: 'uppercase', color: cfg.addBoxLabelColor, marginBottom: '4px' }}>Unit</label>
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
                    style={{ background: cfg.addItemBtnBg, color: '#fff', fontSize: '12px', minHeight: '32px', padding: '4px 12px' }}
                  >
                    + Add Item
                  </Button>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px', marginTop: '16px', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }}>
                  <Button type="button" variant="ghost" onClick={() => { setEditDialogOpen(false); setSelectedGroup(null); }}>Cancel</Button>
                  <Button type="submit" style={{ background: cfg.saveBtnBg, color: '#fff' }}>Save Changes</Button>
                </div>
              </form>
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

export function StockIn({ api }) {
  return <StockBatch api={api} mode="IN" />;
}

export function StockOut({ api }) {
  return <StockBatch api={api} mode="OUT" />;
}
export function StockReports({ api }) {
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
  const [actStartDate, setActStartDate] = useState(() => reportRange('this-month')[0]);
  const [actEndDate, setActEndDate] = useState(() => reportRange('this-month')[1]);
  const [actCategory, setActCategory] = useState('');
  const [actName, setActName] = useState('');
  const [showActivityTable, setShowActivityTable] = useState(false);

  // Filters Transaction Audit Tab
  const [audPeriod, setAudPeriod] = useState('this-month');
  const [audStartDate, setAudStartDate] = useState(() => reportRange('this-month')[0]);
  const [audEndDate, setAudEndDate] = useState(() => reportRange('this-month')[1]);
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

  const changeActivityPeriod = value => {
    setActPeriod(value);
    if (value !== 'custom') {
      const [start, end] = reportRange(value);
      setActStartDate(start); setActEndDate(end);
    }
  };

  const changeAuditPeriod = value => {
    setAudPeriod(value);
    if (value !== 'custom') {
      const [start, end] = reportRange(value);
      setAudStartDate(start); setAudEndDate(end);
    }
  };

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
    if (!audStartDate || !audEndDate || audStartDate > audEndDate) {
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

  const triggerExport = async (reportName) => {
    try {
      const { buildReportPdf } = await import('../utils/reports');
      let headers, rows, scope;
      if (reportName === 'Product List Report') {
        headers = ['Product ID', 'Product Name', 'Category', 'Description', 'Stock Available', 'Low Stock Level'];
        rows = filteredProducts.map(p => [p.code, p.name, p.category_name, p.description, p.qty, p.reorder]);
        scope = prodCategory || 'All categories';
      } else if (reportName === 'Product Activity Report') {
        headers = ['Date', 'Product ID', 'Product Name', 'Type', 'Details', 'Quantity', 'Unit'];
        rows = filteredActivityLogs.map(t => [t.date, t.product_code, t.product_name, t.type, t.details, t.qty, t.unit]);
        scope = `${actStartDate} to ${actEndDate} | ${actCategory || 'All categories'} | ${actName || 'All products'}`;
      } else {
        headers = ['Category', 'Product ID', 'Product Name', 'Opening Stock', 'Stock In', 'Stock Out', 'Net Quantity'];
        rows = auditRows.map(r => [r.category, r.code, r.name, r.openingStock, r.periodIn, r.periodOut, r.netQty]);
        scope = `${audStartDate} to ${audEndDate} | ${audCategory || 'All categories'}`;
      }
      buildReportPdf(reportName, headers, rows, scope).save(`${reportName.replaceAll(' ', '_')}_${localDate()}.pdf`);
      setToastMsg('PDF report downloaded.');
      setToastShow(true);
      setTimeout(() => setToastShow(false), 4000);
    } catch (error) {
      alert(apiError(error, 'Unable to generate the PDF report.'));
    }
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
          <div className="stock-print-surface" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
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
                <Select value={actPeriod} onChange={(e) => changeActivityPeriod(e.target.value)}>
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
            <div className="stock-print-surface" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
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
                <Select value={audPeriod} onChange={(e) => changeAuditPeriod(e.target.value)}>
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
            <div className="stock-print-surface" style={{ background: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', overflowX: 'auto' }}>
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
