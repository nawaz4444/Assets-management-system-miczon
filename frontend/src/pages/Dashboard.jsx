import React, { useEffect, useState, useContext } from 'react';
import axios from 'axios';
import { UserContext } from '../App';
import {
    Container, Typography, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Paper, Button, Box,
    Dialog, DialogTitle, DialogContent, List, ListItem, ListItemText, Divider,
    Chip, IconButton, Tooltip, Grid, Card, TextField, MenuItem,
    DialogActions, CircularProgress
} from '@mui/material';

// Icons
import HistoryIcon from '@mui/icons-material/History';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import PrintIcon from '@mui/icons-material/Print';
import DashboardIcon from '@mui/icons-material/Dashboard';
import CloseIcon from '@mui/icons-material/Close';
import DownloadIcon from '@mui/icons-material/Download';
import VisibilityIcon from '@mui/icons-material/Visibility';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import BuildIcon from '@mui/icons-material/Build';
import SearchIcon from '@mui/icons-material/Search';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';
import FilterAltOffIcon from '@mui/icons-material/FilterAltOff';

// Utils
import { printAssetLabel } from '../AssetLabel';
import SearchFilterBar from '../SearchFilterBar';
import RepairWatchlist from '../RepairWatchlist';
import { fetchAllPages } from '../utils/apiHelpers';
import { API_BASE } from '../utils/config';

function Dashboard({ token, handleLogout }) {
    // --- State ---
    const [assets, setAssets] = useState([]);
    const [departments, setDepartments] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [stats, setStats] = useState(null);
    const [loading, setLoading] = useState(true);
    const [initialLoadDone, setInitialLoadDone] = useState(false);

    // Pagination State
    const [nextPage, setNextPage] = useState(null);
    const [prevPage, setPrevPage] = useState(null);
    const [totalAssets, setTotalAssets] = useState(0);

    const [searchTerm, setSearchTerm] = useState('');
    const [filterDept, setFilterDept] = useState('');
    const [filterStatus, setFilterStatus] = useState('');
    const [filterCategory, setFilterCategory] = useState('');

    // Sorting State
    const [sortBy, setSortBy] = useState(null); // Column name to sort by
    const [sortOrder, setSortOrder] = useState('asc'); // 'asc' or 'desc'

    // Modal States
    const [openHistory, setOpenHistory] = useState(false);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [assetHistory, setAssetHistory] = useState([]);

    const [openDetails, setOpenDetails] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState(null);

    // Asset Lifecycle States
    const [openTransfer, setOpenTransfer] = useState(false);
    const [openRepair, setOpenRepair] = useState(false);

    const [transferTo, setTransferTo] = useState('');
    const [transferRemarks, setTransferRemarks] = useState('');

    const [repairVendor, setRepairVendor] = useState('');
    const [repairExpectedReturn, setRepairExpectedReturn] = useState('');
    const [repairIssue, setRepairIssue] = useState('');

    const { user } = useContext(UserContext);
    const authConfig = { headers: { Authorization: `Token ${token}` } };

    // --- Effects ---
    useEffect(() => {
        if (token) {
            initDashboard();
        }
    }, [token]);

    // Auto-select and lock department for non-superusers
    useEffect(() => {
        if (user && !user.is_superuser && user.employee_details) {
            setFilterDept(user.employee_details.department || '');
        }
    }, [user]);

    // 🚀 OPTIMIZATION 1: Parallel Fetching with Crash Fix
    const initDashboard = async () => {
        setLoading(true);
        try {
            const [assetRes, deptRes, empRes, statsRes] = await Promise.all([
                axios.get(`${API_BASE}/assets/`, authConfig),
                axios.get(`${API_BASE}/departments/`, authConfig),
                fetchAllPages(`${API_BASE}/employees/`, authConfig),
                // Handle missing stats endpoint gracefully
                axios.get(`${API_BASE}/reports/dashboard-stats/`, authConfig).catch(() => ({ data: null }))
            ]);

            // Handle Pagination vs List
            const assetData = assetRes.data;
            if (Array.isArray(assetData)) {
                setAssets(assetData);
                setTotalAssets(assetData.length);
                setNextPage(null);
                setPrevPage(null);
            } else if (assetData.results) {
                setAssets(assetData.results);
                setTotalAssets(assetData.count);
                setNextPage(assetData.next);
                setPrevPage(assetData.previous);
            } else {
                setAssets([]);
            }

            setDepartments(deptRes.data);
            setEmployees(empRes); // empRes is already an array from fetchAllPages
            setStats(statsRes ? statsRes.data : null);
            setInitialLoadDone(true);
        } catch (err) {
            handleError(err);
        } finally {
            setLoading(false);
        }
    };

    // 🚀 OPTIMIZATION 2: Server-Side Pagination & Filtering - Fetches ALL pages when filtering
    const fetchData = async (url = null, applyFilters = true) => {
        setLoading(true);
        let apiUrl = url || `${API_BASE}/assets/`;

        try {
            if (applyFilters && !url) {
                // When filtering/searching, fetch ALL pages to show complete results
                const params = {};
                if (filterDept) params.department = filterDept;
                if (filterStatus) params.status = filterStatus;
                if (filterCategory) params.category = filterCategory;
                if (searchTerm) params.search = searchTerm;

                const allResults = await fetchAllPages(apiUrl, authConfig, params);
                setAssets(allResults);
                setTotalAssets(allResults.length);
                setNextPage(null);
                setPrevPage(null);
            } else if (url) {
                // Manual pagination (Previous/Next buttons) - fetch single page
                const res = await axios.get(url, authConfig);
                const data = res.data;
                if (Array.isArray(data)) {
                    setAssets(data);
                    setTotalAssets(data.length);
                    setNextPage(null);
                    setPrevPage(null);
                } else {
                    setAssets(data.results);
                    setNextPage(data.next);
                    setPrevPage(data.previous);
                    setTotalAssets(data.count);
                }
            } else {
                // Initial load - fetch first page only (for performance)
                const res = await axios.get(apiUrl, authConfig);
                const data = res.data;
                if (Array.isArray(data)) {
                    setAssets(data);
                    setTotalAssets(data.length);
                    setNextPage(null);
                    setPrevPage(null);
                } else {
                    setAssets(data.results);
                    setNextPage(data.next);
                    setPrevPage(data.previous);
                    setTotalAssets(data.count);
                }
            }
        } catch (error) {
            handleError(error);
        } finally {
            setLoading(false);
        }
    };

    // Auto trigger fetchData when filter/search state changes
    useEffect(() => {
        if (!initialLoadDone) return; // Wait for initial load
        
        const timeoutId = setTimeout(() => {
            const hasFilters = filterDept !== '' || filterStatus !== '' || filterCategory !== '' || searchTerm !== '';
            fetchData(null, hasFilters);
        }, 400); // 400ms debounce
        
        return () => clearTimeout(timeoutId);
    }, [filterDept, filterStatus, filterCategory, searchTerm, initialLoadDone]);

    // 🚀 OPTIMIZATION 3: Lazy Load History
    const handleViewHistory = async (asset) => {
        setSelectedAsset(asset);
        setOpenHistory(true);
        setHistoryLoading(true);
        try {
            const res = await axios.get(`${API_BASE}/assets/${asset.id}/`, authConfig);
            setAssetHistory(res.data.history || []);
        } catch (err) {
            console.error("Failed to fetch history", err);
            alert("Could not load history.");
        } finally {
            setHistoryLoading(false);
        }
    };

    const fetchDepartments = () => axios.get(`${API_BASE}/departments/`, authConfig).then(res => setDepartments(res.data));
    const fetchEmployees = () => fetchAllPages(`${API_BASE}/employees/`, authConfig).then(res => setEmployees(res));

    const handleError = (error) => { if (error.response && error.response.status === 401) handleLogout(); };

    // --- Handlers ---
    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        axios.post(`${API_BASE}/upload/`, formData, authConfig)
            .then(res => { alert(res.data.message); fetchData(); fetchDepartments(); fetchEmployees(); })
            .catch(err => { console.error(err); alert("Upload Failed!"); });
    };

    const handleTransfer = async () => {
        if (!transferTo) return alert("Select an employee!");
        try {
            const res = await axios.post(`${API_BASE}/assets/${selectedAsset.id}/transfer/`, {
                to_employee_id: transferTo,
                remarks: transferRemarks
            }, authConfig);
            alert(res.data.status || "Transfer processed!");
            setOpenTransfer(false);
            setOpenDetails(false);
            fetchData();
        } catch (err) {
            console.error(err);
            alert("Transfer failed!");
        }
    };

    const handleRepair = async () => {
        if (!repairVendor || !repairExpectedReturn) return alert("Fill required fields!");
        try {
            const res = await axios.post(`${API_BASE}/assets/${selectedAsset.id}/repair/`, {
                vendor: repairVendor,
                expected_return: repairExpectedReturn,
                issue: repairIssue
            }, authConfig);
            alert(res.data.status || "Repair processed!");
            setOpenRepair(false);
            setOpenDetails(false);
            fetchData();
        } catch (err) {
            console.error(err);
            alert("Repair log failed!");
        }
    };

    // --- FILTER LOGIC ---
    // Note: When filters are applied, fetchData already fetches filtered results from server
    // This client-side filtering is only used when no server-side filters are active
    const uniqueCategories = [...new Set(assets.map(item => item.category).filter(Boolean))];

    // Filter assets
    const filteredAssets = (filterDept || filterStatus || filterCategory || searchTerm)
        ? assets // Server-side filtering already applied, use assets as-is
        : assets.filter(asset => {
            // Only apply client-side filtering if no server filters are active
            const name = asset.name ? asset.name.toLowerCase() : '';
            const id = asset.miczon_id ? asset.miczon_id.toLowerCase() : '';
            const custodian = asset.custodian_name ? asset.custodian_name.toLowerCase() : '';
            const search = searchTerm.toLowerCase();
            const matchesSearch = !searchTerm || name.includes(search) || id.includes(search) || custodian.includes(search);

            const assetDept = asset.department_name || '';
            const matchesDept = filterDept ? assetDept === filterDept : true;
            const matchesStatus = filterStatus ? asset.current_status === filterStatus : true;
            const matchesCategory = filterCategory ? asset.category === filterCategory : true;

            return matchesSearch && matchesDept && matchesStatus && matchesCategory;
        });

    // Sort assets
    const sortedAssets = [...filteredAssets].sort((a, b) => {
        if (!sortBy) return 0;

        let aValue, bValue;

        switch (sortBy) {
            case 'miczon_id':
                aValue = (a.miczon_id || '').toLowerCase();
                bValue = (b.miczon_id || '').toLowerCase();
                break;
            case 'name':
                aValue = (a.name || '').toLowerCase();
                bValue = (b.name || '').toLowerCase();
                break;
            case 'specifications':
                aValue = (a.specifications || '').toLowerCase();
                bValue = (b.specifications || '').toLowerCase();
                break;
            case 'department':
                aValue = (a.department_name || 'General').toLowerCase();
                bValue = (b.department_name || 'General').toLowerCase();
                break;
            case 'custodian':
                aValue = (a.custodian_name || 'In Stock').toLowerCase();
                bValue = (b.custodian_name || 'In Stock').toLowerCase();
                break;
            case 'status':
                aValue = (a.current_status || '').toLowerCase();
                bValue = (b.current_status || '').toLowerCase();
                break;
            default:
                return 0;
        }

        if (aValue < bValue) return sortOrder === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortOrder === 'asc' ? 1 : -1;
        return 0;
    });

    // Handle column header click for sorting
    const handleSort = (column) => {
        if (sortBy === column) {
            // Toggle sort order if clicking the same column
            setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
        } else {
            // Set new column and default to ascending
            setSortBy(column);
            setSortOrder('asc');
        }
    };

    // Get sort icon for column header
    const getSortIcon = (column) => {
        if (sortBy !== column) {
            return <UnfoldMoreIcon sx={{ fontSize: 16, ml: 0.5, opacity: 0.5 }} />;
        }
        return sortOrder === 'asc'
            ? <ArrowUpwardIcon sx={{ fontSize: 16, ml: 0.5, color: 'primary.main' }} />
            : <ArrowDownwardIcon sx={{ fontSize: 16, ml: 0.5, color: 'primary.main' }} />;
    };

    const clearFilters = () => {
        setSearchTerm(''); setFilterStatus(''); setFilterCategory('');
        if (user && !user.is_superuser && user.employee_details) {
            setFilterDept(user.employee_details.department || '');
        } else {
            setFilterDept('');
        }
        fetchData();
    };

    // --- Render ---
    return (
        <Container maxWidth="xl" sx={{ mt: 6, pb: 8 }}>
            <Paper
                elevation={6}
                sx={{
                    p: 4,
                    borderRadius: 3,
                    borderTop: '6px solid #1976d2',
                    transition: 'transform 0.3s, box-shadow 0.3s',
                    '&:hover': { transform: 'translateY(-4px)', boxShadow: 10 }
                }}
            >
                {/* Header Section */}
                <Box mb={4} display="flex" alignItems="center">
                    <DashboardIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                    <Box>
                        <Typography variant="h4" component="h1" sx={{ fontWeight: 800, letterSpacing: '-0.5px', color: '#000000' }}>
                            Asset Dashboard
                        </Typography>
                        <Typography variant="body1" color="textSecondary">
                            Manage inventory, view history, and print labels.
                        </Typography>
                    </Box>
                </Box>

                {/* Search & Filter Bar */}
                <Box mb={3}>
                    <SearchFilterBar
                        searchTerm={searchTerm} setSearchTerm={setSearchTerm}
                        filterDept={filterDept} setFilterDept={setFilterDept}
                        filterStatus={filterStatus} setFilterStatus={setFilterStatus}
                        filterCategory={filterCategory} setFilterCategory={setFilterCategory}
                        departments={
                            (user && !user.is_superuser && user.employee_details)
                                ? departments.filter(d => d.id === user.employee_details.department)
                                : departments
                        }
                        uniqueCategories={uniqueCategories}
                        clearFilters={clearFilters}
                    >
                        <Button
                            variant="outlined"
                            onClick={clearFilters}
                            startIcon={<FilterAltOffIcon />}
                            sx={{ textTransform: 'none', borderRadius: 2, px: 3, mr: 1, color: 'text.secondary', borderColor: 'divider' }}
                        >
                            Clear Filters
                        </Button>
                        <Button
                            variant="contained"
                            component="label"
                            startIcon={<CloudUploadIcon />}
                        >
                            Upload Excel
                            <input type="file" hidden accept=".xlsx, .csv" onChange={handleFileUpload} />
                        </Button>
                    </SearchFilterBar>
                </Box>

                {/* Asset Count & Stats Info */}
                <Box mb={2} display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="subtitle2" color="textSecondary" fontWeight="bold">
                        Showing {assets.length} of {totalAssets} Assets
                    </Typography>
                    {stats && (
                        <Box display="flex" gap={2}>
                            <Chip label={`Available: ${stats.total_unassigned}`} size="small" variant="outlined" color="primary" />
                            <Chip label={`Assigned: ${stats.total_assigned}`} size="small" variant="outlined" color="primary" />
                            <Chip label={`Repair: ${stats.total_repair}`} size="small" variant="outlined" color="error" />
                        </Box>
                    )}
                </Box>

                {/* Table */}
                <TableContainer component={Paper} elevation={0} variant="outlined" sx={{ maxHeight: '70vh', borderRadius: 2 }}>
                    <Table stickyHeader>
                        <TableHead>
                            <TableRow>
                                <TableCell
                                    sx={{
                                        bgcolor: '#e3f2fd',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        '&:hover': { bgcolor: '#d0e3f5' }
                                    }}
                                    onClick={() => handleSort('miczon_id')}
                                >
                                    <Box display="flex" alignItems="center">
                                        Miczon ID
                                        {getSortIcon('miczon_id')}
                                    </Box>
                                </TableCell>
                                <TableCell
                                    sx={{
                                        bgcolor: '#e3f2fd',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        '&:hover': { bgcolor: '#d0e3f5' }
                                    }}
                                    onClick={() => handleSort('name')}
                                >
                                    <Box display="flex" alignItems="center">
                                        Device Info
                                        {getSortIcon('name')}
                                    </Box>
                                </TableCell>
                                <TableCell
                                    sx={{
                                        bgcolor: '#e3f2fd',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        '&:hover': { bgcolor: '#d0e3f5' }
                                    }}
                                    onClick={() => handleSort('specifications')}
                                >
                                    <Box display="flex" alignItems="center">
                                        Specs
                                        {getSortIcon('specifications')}
                                    </Box>
                                </TableCell>
                                <TableCell
                                    sx={{
                                        bgcolor: '#e3f2fd',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        '&:hover': { bgcolor: '#d0e3f5' }
                                    }}
                                    onClick={() => handleSort('department')}
                                >
                                    <Box display="flex" alignItems="center">
                                        Department
                                        {getSortIcon('department')}
                                    </Box>
                                </TableCell>
                                <TableCell
                                    sx={{
                                        bgcolor: '#e3f2fd',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        '&:hover': { bgcolor: '#d0e3f5' }
                                    }}
                                    onClick={() => handleSort('custodian')}
                                >
                                    <Box display="flex" alignItems="center">
                                        Custodian
                                        {getSortIcon('custodian')}
                                    </Box>
                                </TableCell>
                                <TableCell
                                    sx={{
                                        bgcolor: '#e3f2fd',
                                        fontWeight: 'bold',
                                        cursor: 'pointer',
                                        userSelect: 'none',
                                        '&:hover': { bgcolor: '#d0e3f5' }
                                    }}
                                    onClick={() => handleSort('status')}
                                >
                                    <Box display="flex" alignItems="center">
                                        Status
                                        {getSortIcon('status')}
                                    </Box>
                                </TableCell>
                                <TableCell sx={{ bgcolor: '#e3f2fd', fontWeight: 'bold', textAlign: 'center' }}>Actions</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 5 }}>
                                        <CircularProgress />
                                    </TableCell>
                                </TableRow>
                            ) : sortedAssets.length > 0 ? (
                                sortedAssets.map((asset) => (
                                    <TableRow key={asset.id} hover>
                                        <TableCell>
                                            <Typography
                                                variant="body2" fontWeight="bold"
                                                sx={{ cursor: 'pointer', textDecoration: 'underline', color: '#000000' }}
                                                onClick={() => { setSelectedAsset(asset); setOpenDetails(true); }}
                                            >
                                                {asset.miczon_id}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" fontWeight="500" sx={{ color: '#000000' }}>{asset.name}</Typography>
                                            <Chip label={asset.category} size="small" variant="outlined" sx={{ mt: 0.5, height: 20, fontSize: '0.7rem' }} />
                                        </TableCell>
                                        <TableCell sx={{ maxWidth: 250 }}>
                                            <Typography variant="body2" noWrap title={asset.specifications} color="textSecondary">
                                                {asset.specifications}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>{asset.department_name || <span style={{ color: '#aaa' }}>General</span>}</TableCell>
                                        <TableCell>
                                            {asset.custodian_name ? (
                                                <Box display="flex" alignItems="center" gap={1}>
                                                    <Typography variant="body2">{asset.custodian_name}</Typography>
                                                </Box>
                                            ) : (
                                                <Chip label="In Stock" size="small" />
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={asset.current_status} size="small"
                                                color={
                                                    asset.current_status === 'AVAILABLE' ? "primary" :
                                                        asset.current_status === 'BROKEN' ? "error" :
                                                            asset.current_status === 'ASSIGNED' ? "primary" : "default"
                                                }
                                                variant={asset.current_status === 'AVAILABLE' ? "filled" : "outlined"}
                                            />
                                        </TableCell>
                                        <TableCell align="center">
                                            <Tooltip title="View Details">
                                                <IconButton size="small" color="primary" onClick={() => { setSelectedAsset(asset); setOpenDetails(true); }}>
                                                    <VisibilityIcon />
                                                </IconButton>
                                            </Tooltip>
                                            <Tooltip title="View History">
                                                <IconButton size="small" color="secondary" onClick={() => handleViewHistory(asset)}>
                                                    <HistoryIcon />
                                                </IconButton>
                                            </Tooltip>
                                        </TableCell>
                                    </TableRow>
                                ))
                            ) : (
                                <TableRow>
                                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                                        <Typography color="textSecondary">No assets found matching filters.</Typography>
                                    </TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>

                {/* Pagination */}
                <Box mt={3} display="flex" justifyContent="center" alignItems="center" gap={3}>
                    <Button
                        variant="outlined" disabled={!prevPage}
                        onClick={() => fetchData(prevPage, false)}
                        sx={{ borderRadius: 2 }}
                    >
                        Previous Page
                    </Button>
                    <Typography variant="body2" color="textSecondary">
                        Total Assets: {totalAssets}
                    </Typography>
                    <Button
                        variant="contained" disabled={!nextPage}
                        onClick={() => fetchData(nextPage, false)}
                        sx={{ borderRadius: 2 }}
                    >
                        Next Page
                    </Button>
                </Box>
            </Paper>

            {/* --- HISTORY DIALOG --- */}
            <Dialog open={openHistory} onClose={() => setOpenHistory(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ borderBottom: '1px solid #eee', bgcolor: '#fafafa' }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Box>
                            <Typography variant="h6">Asset History</Typography>
                            <Typography variant="caption" color="textSecondary">{selectedAsset?.miczon_id} - {selectedAsset?.name}</Typography>
                        </Box>
                        <IconButton onClick={() => setOpenHistory(false)} size="small"><CloseIcon /></IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ p: 0 }}>
                    {historyLoading ? (
                        <Box p={4} display="flex" justifyContent="center"><CircularProgress /></Box>
                    ) : (
                        <List>
                            {assetHistory && assetHistory.length > 0 ? (
                                assetHistory.map((rec, idx) => (
                                    <React.Fragment key={idx}>
                                        <ListItem alignItems="flex-start" sx={{ px: 3, py: 2 }}>
                                            <ListItemText
                                                primary={<Typography fontWeight="bold" color="primary">{rec.action}</Typography>}
                                                secondary={
                                                    <Box component="span" display="flex" flexDirection="column" mt={0.5}>
                                                        <Typography variant="caption" color="textPrimary">
                                                            {new Date(rec.date).toLocaleString()}
                                                        </Typography>
                                                        <Typography variant="body2" color="textSecondary" sx={{ mt: 0.5 }}>
                                                            {rec.from_employee ? `From: ${assets.find(a => a.id === rec.from_employee)?.custodian_name || 'Stock'}` : ''}
                                                            {rec.from_employee && rec.to_employee ? ' ➝ ' : ''}
                                                            {rec.to_employee ? `To: ${employees.find(e => e.id === rec.to_employee)?.name || 'Stock'}` : ''}
                                                        </Typography>
                                                    </Box>
                                                }
                                            />
                                        </ListItem>
                                        <Divider component="li" />
                                    </React.Fragment>
                                ))
                            ) : (
                                <Box p={4} textAlign="center"><Typography color="textSecondary">No history records found.</Typography></Box>
                            )}
                        </List>
                    )}
                </DialogContent>
            </Dialog>

            {/* --- DETAILS DIALOG --- */}
            <Dialog open={openDetails} onClose={() => setOpenDetails(false)} maxWidth="md" fullWidth>
                <DialogTitle sx={{ borderBottom: '1px solid #eee', bgcolor: '#fafafa' }}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                        <Typography variant="h6">Asset Details</Typography>
                        <IconButton onClick={() => setOpenDetails(false)} size="small"><CloseIcon /></IconButton>
                    </Box>
                </DialogTitle>
                <DialogContent sx={{ p: 4 }}>
                    {selectedAsset && (
                        <Grid container spacing={4}>
                            <Grid item xs={12} md={7}>
                                <Box mb={4}>
                                    <Typography variant="h6" sx={{ mb: 0.5, color: '#000000' }}>ID: {selectedAsset.miczon_id}</Typography>
                                    <Typography variant="h6" sx={{ color: '#000000' }}>{selectedAsset.name}</Typography>
                                </Box>
                                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2.5 }}>
                                    <Box><Typography variant="caption" color="textSecondary" display="block">Category</Typography><Typography variant="body1">{selectedAsset.category}</Typography></Box>
                                    <Box><Typography variant="caption" color="textSecondary" display="block">Status</Typography><Typography variant="body1">{selectedAsset.current_status}</Typography></Box>
                                    <Box><Typography variant="caption" color="textSecondary" display="block">Department</Typography><Typography variant="body1">{selectedAsset.department_name || 'General'}</Typography></Box>
                                    <Box><Typography variant="caption" color="textSecondary" display="block">Custodian</Typography><Typography variant="body1">{selectedAsset.custodian_name || 'In Stock'}</Typography></Box>
                                    <Box><Typography variant="caption" color="textSecondary" display="block">Specifications</Typography><Typography variant="body1" sx={{ whiteSpace: 'pre-wrap' }}>{selectedAsset.specifications || 'N/A'}</Typography></Box>
                                    {selectedAsset.remarks && (<Box><Typography variant="caption" color="textSecondary" display="block">Remarks</Typography><Typography variant="body1">{selectedAsset.remarks}</Typography></Box>)}
                                </Box>
                            </Grid>
                            <Grid item xs={12} md={5}>
                                <Card variant="outlined" sx={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, bgcolor: '#f5f5f5', borderRadius: 2 }}>
                                    {selectedAsset.qr_code_url ? (
                                        <>
                                            <Box component="img" src={selectedAsset.qr_code_url} alt="Asset QR" sx={{ width: '100%', maxWidth: 200, height: 'auto', border: '1px solid #ddd', borderRadius: 2, bgcolor: 'white', p: 1 }} />
                                            <Button variant="contained" fullWidth startIcon={<PrintIcon />} onClick={() => printAssetLabel(selectedAsset)} sx={{ mt: 3 }}>Print Label</Button>
                                            <Button variant="outlined" fullWidth startIcon={<DownloadIcon />} href={selectedAsset.qr_code_url} download={`QR_${selectedAsset.miczon_id}.png`} sx={{ mt: 1 }}>Download PNG</Button>
                                            <Divider sx={{ my: 3, width: '100%' }} />
                                            <Typography variant="caption" color="textSecondary" sx={{ mb: 1 }}>Lifecycle Actions</Typography>
                                            <Button variant="outlined" fullWidth startIcon={<CompareArrowsIcon />} onClick={() => { setOpenTransfer(true); setTransferTo(''); setTransferRemarks(''); }} sx={{ mb: 1, borderColor: 'primary.main', color: 'primary.main' }}>
                                                {user?.is_superuser ? 'Direct Transfer' : 'Request Transfer'}
                                            </Button>
                                            <Button variant="outlined" fullWidth startIcon={<BuildIcon />} onClick={() => { setOpenRepair(true); setRepairVendor(''); setRepairIssue(''); }} color="error">
                                                {user?.is_superuser ? 'Send to Repair' : 'Request Repair'}
                                            </Button>
                                        </>
                                    ) : (
                                        <Typography color="textSecondary">No QR Code generated</Typography>
                                    )}
                                </Card>
                            </Grid>
                        </Grid>
                    )}
                </DialogContent>
            </Dialog>

            {/* --- TRANSFER DIALOG --- */}
            <Dialog open={openTransfer} onClose={() => setOpenTransfer(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Transfer Asset</DialogTitle>
                <DialogContent>
                    <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <Typography variant="body2" color="textSecondary">Transferring <strong>{selectedAsset?.miczon_id}</strong> from <strong>{selectedAsset?.custodian_name || 'Stock'}</strong></Typography>
                        <TextField select fullWidth label="To Employee" value={transferTo} onChange={(e) => setTransferTo(e.target.value)}>
                            {employees.map((emp) => (<MenuItem key={emp.id} value={emp.id}>{emp.name} ({emp.employee_id})</MenuItem>))}
                        </TextField>
                        <TextField fullWidth multiline rows={2} label="Remarks" value={transferRemarks} onChange={(e) => setTransferRemarks(e.target.value)} />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenTransfer(false)}>Cancel</Button>
                    <Button onClick={handleTransfer} variant="contained">
                        {user?.is_superuser ? 'Confirm Transfer' : 'Submit Request'}
                    </Button>
                </DialogActions>
            </Dialog>

            {/* --- REPAIR DIALOG --- */}
            <Dialog open={openRepair} onClose={() => setOpenRepair(false)} maxWidth="xs" fullWidth>
                <DialogTitle>Send to Repair</DialogTitle>
                <DialogContent>
                    <Box sx={{ mt: 1, display: 'flex', flexDirection: 'column', gap: 2 }}>
                        <TextField fullWidth label="Maintenance Vendor" placeholder="e.g. Dell Service Center" value={repairVendor} onChange={(e) => setRepairVendor(e.target.value)} />
                        <TextField fullWidth type="date" label="Expected Return Date" InputLabelProps={{ shrink: true }} value={repairExpectedReturn} onChange={(e) => setRepairExpectedReturn(e.target.value)} />
                        <TextField fullWidth multiline rows={2} label="Issue Details" value={repairIssue} onChange={(e) => setRepairIssue(e.target.value)} />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenRepair(false)}>Cancel</Button>
                    <Button onClick={handleRepair} variant="contained" color="error" sx={{ '&.MuiButton-containedError': { backgroundColor: '#BA1A1A' } }}>
                        {user?.is_superuser ? 'Confirm Send to Repair' : 'Submit Request'}
                    </Button>
                </DialogActions>
            </Dialog>

            <RepairWatchlist
                token={token}
                onAssetReturned={() => {
                    fetchData();
                    initDashboard();
                }}
            />
        </Container>
    );
}

export default Dashboard;