/* eslint-disable react-hooks/immutability, no-unused-vars */
import React, { useState, useEffect, useRef, useContext } from 'react';
import axios from 'axios';
import { UserContext } from '../App';
import {
    Container, Grid, Card, CardContent, Typography, Box,
    Button, Tab, Tabs, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Paper, Chip, Avatar, Autocomplete, TextField,
    TablePagination, Skeleton, IconButton
} from '@mui/material';
import {
    Inventory, Assessment, Build, Store,
    Print, GetApp, FilterList, Refresh
} from '@mui/icons-material';
import ArrowUpwardIcon from '@mui/icons-material/ArrowUpward';
import ArrowDownwardIcon from '@mui/icons-material/ArrowDownward';
import UnfoldMoreIcon from '@mui/icons-material/UnfoldMore';

// --- STYLES FOR PRINTING ---
// --- STYLES FOR PRINTING ---
const printStyles = `
@media print {
    @page { size: A4 landscape; margin: 10mm; }
    
    /* 1. Global Resets */
    body { background-color: white !important; -webkit-print-color-adjust: exact; }
    html, body, #root { height: auto !important; overflow: visible !important; }
    
    /* 2. Hide specific global elements by class/tag */
    header, footer, nav, .MuiAppBar-root { display: none !important; }
    
    /* 3. Hide elements explicitly marked as no-print */
    .no-print { display: none !important; }
    
    /* 4. Ensure the report container is visible and styled */
    #report-container { 
        display: block !important; 
        width: 100% !important; 
        margin: 0 !important; 
        padding: 0 !important;
        position: static !important;
    }
    .print-only { display: block !important; }
    
    /* 5. Table Styling for Print */
    table { width: 100% !important; border-collapse: collapse !important; font-size: 10px !important; }
    th, td { border: 1px solid #000 !important; padding: 4px !important; color: black !important; }
    th { background-color: #f0f0f0 !important; font-weight: bold !important; }
    
    /* 6. Fix MUI Table Container overflow */
    .MuiPaper-root { box-shadow: none !important; border: none !important; }
    .MuiTableContainer-root { 
        max-height: none !important; 
        overflow: visible !important; 
        display: block !important; 
        box-shadow: none !important;
    }
    
    /* Hide Table Pagination explicitly if not done by no-print */
    .MuiTablePagination-root { display: none !important; }
}
.print-only { display: none; }
`;

function StatsCard({ title, value, icon, color, onClick, loading }) {
    return (
        <Card
            variant="outlined"
            onClick={onClick}
            sx={{
                height: '100%',
                cursor: onClick ? 'pointer' : 'default',
                bgcolor: 'background.paper',
                borderRadius: 2,
                transition: 'transform 0.2s',
                '&:hover': onClick ? { transform: 'translateY(-4px)', borderColor: color, boxShadow: 3 } : {},
                borderLeft: `6px solid ${color}`
            }}
        >
            <CardContent sx={{ display: 'flex', alignItems: 'center', p: 3 }}>
                <Avatar sx={{ bgcolor: `${color}22`, color: color, width: 56, height: 56, mr: 2 }}>
                    {icon}
                </Avatar>
                <Box>
                    <Typography color="textSecondary" variant="subtitle2" fontWeight="bold">
                        {title}
                    </Typography>
                    {loading ? (
                        <Skeleton variant="text" width={60} height={40} />
                    ) : (
                        <Typography variant="h4" fontWeight="800">
                            {value}
                        </Typography>
                    )}
                </Box>
            </CardContent>
        </Card>
    );
}

import { API_BASE } from '../utils/config';

export default function ReportsDashboard({ token }) {
    const { user } = useContext(UserContext);

    // --- STATE ---
    const [stats, setStats] = useState({ total_assets: 0, total_assigned: 0, total_unassigned: 0, total_repair: 0 });
    const [loadingStats, setLoadingStats] = useState(true);

    const [assets, setAssets] = useState([]);
    const [categoryStats, setCategoryStats] = useState([]);
    const [loadingData, setLoadingData] = useState(true);

    const [tabValue, setTabValue] = useState(0);
    const [page, setPage] = useState(0);
    const [rowsPerPage, setRowsPerPage] = useState(10);

    // Filters
    const [filters, setFilters] = useState({
        department: null,
        category: null,
        status: null
    });

    // Sorting State
    const [sortBy, setSortBy] = useState(null); // Column name to sort by
    const [sortOrder, setSortOrder] = useState('asc'); // 'asc' or 'desc'

    const [deptOptions, setDeptOptions] = useState([]);
    const [catOptions, setCatOptions] = useState([]);

    const authConfig = { headers: { Authorization: `Token ${token}` } };

    // --- API CALLS ---
    useEffect(() => {
        if (token) {
            fetchDashboardStats();
            fetchDepartments();
        }
    }, [token]);

    useEffect(() => {
        if (token) {
            fetchReportData();
            if (tabValue === 1) fetchCategoryBreakdown();
        }
    }, [filters, tabValue, token]);

    // Auto-select and lock department for non-superusers
    useEffect(() => {
        if (user && !user.is_superuser && user.employee_details && deptOptions.length > 0) {
            const userDept = deptOptions.find(d => d.id === user.employee_details.department);
            if (userDept && (!filters.department || filters.department.id !== userDept.id)) {
                setFilters(prev => ({ ...prev, department: userDept }));
            }
        }
    }, [user, deptOptions]);

    const fetchDashboardStats = () => {
        setLoadingStats(true);
        axios.get(`${API_BASE}/reports/dashboard-stats/`, authConfig)
            .then(res => setStats(res.data))
            .catch(err => console.error("Stats Error", err))
            .finally(() => setLoadingStats(false));
    };

    const fetchDepartments = () => {
        axios.get(`${API_BASE}/departments/`, authConfig)
            .then(res => setDeptOptions(res.data))
            .catch(err => console.error(err));
    };

    const fetchCategoryBreakdown = () => {
        axios.get(`${API_BASE}/reports/category-breakdown/`, authConfig)
            .then(res => setCategoryStats(res.data))
            .catch(err => console.error(err));
    };

    const fetchReportData = () => {
        setLoadingData(true);
        const params = new URLSearchParams();
        if (filters.department) params.append('department', filters.department.id);
        if (filters.category) params.append('category', filters.category);
        if (filters.status) params.append('status', filters.status);

        axios.get(`${API_BASE}/reports/custom-export/?${params.toString()}`, authConfig)
            .then(res => {
                setAssets(res.data);
                if (catOptions.length === 0) {
                    const cats = [...new Set(res.data.map(a => a.category).filter(Boolean))];
                    setCatOptions(cats);
                }
            })
            .catch(err => console.error("Report Data Error", err))
            .finally(() => setLoadingData(false));
    };

    // --- HANDLERS ---
    const handleFilterChange = (key, value) => {
        setFilters(prev => ({ ...prev, [key]: value }));
        setPage(0);
    };

    const handlePrint = () => {
        window.print();
    };

    const handleStatClick = (filterType) => {
        if (filterType === 'UNASSIGNED') {
            handleFilterChange('status', 'AVAILABLE');
            setTabValue(0);
        } else if (filterType === 'ASSIGNED') {
            handleFilterChange('status', 'ASSIGNED');
            setTabValue(0);
        } else if (filterType === 'REPAIR') {
            handleFilterChange('status', 'BROKEN');
            setTabValue(0);
        } else {
            handleFilterChange('status', null);
        }
    };

    // Sort assets
    const sortedAssets = [...assets].sort((a, b) => {
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
            case 'category':
                aValue = (a.category || 'Uncategorized').toLowerCase();
                bValue = (b.category || 'Uncategorized').toLowerCase();
                break;
            case 'custodian':
                aValue = (a.custodian_name || 'In Stock').toLowerCase();
                bValue = (b.custodian_name || 'In Stock').toLowerCase();
                break;
            case 'department':
                aValue = (a.department_name || 'General').toLowerCase();
                bValue = (b.department_name || 'General').toLowerCase();
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
        // Reset to first page when sorting changes
        setPage(0);
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

    // --- RENDER ---
    return (
        <Box id="report-container">
            <style>{printStyles}</style>

            {/* HEADER - PRINT ONLY */}
            <Box className="print-only" sx={{ mb: 4, textAlign: 'center', borderBottom: '2px solid black', pb: 2 }}>
                <Typography variant="h4" fontWeight="bold">Asset Management Report</Typography>
                <Typography variant="subtitle1">Generated on: {new Date().toLocaleDateString()} {new Date().toLocaleTimeString()}</Typography>
            </Box>

            <Container maxWidth="xl" sx={{ mt: 6, pb: 8 }}>
                <Paper
                    className="no-print"
                    elevation={6}
                    sx={{
                        p: 4,
                        borderRadius: 3,
                        borderTop: '6px solid #1976d2',
                        transition: 'transform 0.3s, box-shadow 0.3s',
                        '&:hover': {
                            transform: 'translateY(-4px)',
                            boxShadow: 10
                        }
                    }}
                >
                    {/* PAGE HEADER */}
                    <Box display="flex" alignItems="center" mb={4}>
                        <Assessment sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                        <Box>
                            <Typography variant="h4" component="h1" sx={{ fontWeight: 800, letterSpacing: '-0.5px', color: '#000000' }}>
                                Reports & Analytics
                            </Typography>
                            <Typography variant="body1" color="textSecondary">
                                Track inventory health, audit status, and generate reports.
                            </Typography>
                        </Box>
                    </Box>

                    {/* STATS CARDS (No Print) */}
                    <Grid container spacing={3} sx={{ mb: 4 }} className="no-print">
                        <Grid item xs={12} sm={6} md={3}>
                            <StatsCard
                                title="Total Assets"
                                value={stats.total_assets}
                                icon={<Inventory />}
                                color="#1976d2"
                                loading={loadingStats}
                                onClick={() => handleStatClick('ALL')}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <StatsCard
                                title="Assigned"
                                value={stats.total_assigned}
                                icon={<Assessment />}
                                color="#2e7d32"
                                loading={loadingStats}
                                onClick={() => handleStatClick('ASSIGNED')}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <StatsCard
                                title="Unassigned (Stock)"
                                value={stats.total_unassigned}
                                icon={<Store />}
                                color="#ed6c02"
                                loading={loadingStats}
                                onClick={() => handleStatClick('UNASSIGNED')}
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <StatsCard
                                title="In Repair / Broken"
                                value={stats.total_repair}
                                icon={<Build />}
                                color="#d32f2f"
                                loading={loadingStats}
                                onClick={() => handleStatClick('REPAIR')}
                            />
                        </Grid>
                    </Grid>

                    {/* FILTERS */}
                    <Box className="no-print" sx={{ p: 0, mb: 4 }}>
                        <Grid container spacing={2} alignItems="center">

                            {/* Department */}
                            <Grid item xs={12} md="auto" sx={{ minWidth: 240 }}>
                                <Autocomplete
                                    options={
                                        (user && !user.is_superuser && user.employee_details)
                                            ? deptOptions.filter(d => d.id === user.employee_details.department)
                                            : deptOptions
                                    }
                                    getOptionLabel={(option) => option.name || ''}
                                    value={filters.department}
                                    onChange={(_, newVal) => handleFilterChange('department', newVal)}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            label="Department"
                                            fullWidth
                                            size="small"
                                        />
                                    )}
                                />
                            </Grid>

                            {/* Category */}
                            <Grid item xs={12} md="auto" sx={{ minWidth: 240 }}>
                                <Autocomplete
                                    options={catOptions}
                                    value={filters.category}
                                    onChange={(_, newVal) => handleFilterChange('category', newVal)}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            label="Category"
                                            fullWidth
                                            size="small"
                                        />
                                    )}
                                />
                            </Grid>

                            {/* Status */}
                            <Grid item xs={12} md="auto" sx={{ minWidth: 240 }}>
                                <Autocomplete
                                    options={['AVAILABLE', 'ASSIGNED', 'BROKEN', 'IN_REPAIR']}
                                    value={filters.status}
                                    onChange={(_, newVal) => handleFilterChange('status', newVal)}
                                    renderInput={(params) => (
                                        <TextField
                                            {...params}
                                            label="Status"
                                            fullWidth
                                            size="small"
                                        />
                                    )}
                                />
                            </Grid>

                            {/* Buttons */}
                            <Grid
                                item
                                xs={12}
                                md="auto"
                                display="flex"
                                justifyContent="flex-end"
                                gap={1}
                            >
                                <Button
                                    variant="contained"
                                    startIcon={<Print />}
                                    onClick={handlePrint}
                                >
                                    Print
                                </Button>
                                <Button
                                    variant="outlined"
                                    startIcon={<Refresh />}
                                    onClick={() => {
                                        const defaultDept = (user && !user.is_superuser && user.employee_details)
                                            ? deptOptions.find(d => d.id === user.employee_details.department) || null
                                            : null;
                                        setFilters({ department: defaultDept, category: null, status: null });
                                    }}
                                >
                                    Reset
                                </Button>
                            </Grid>

                        </Grid>
                    </Box>


                    {/* TABS & VIEW */}
                    <Box>
                        <Tabs
                            value={tabValue}
                            onChange={(_, v) => setTabValue(v)}
                            sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}
                            className="no-print"
                        >
                            <Tab label="Detailed List" icon={<FilterList />} iconPosition="start" />
                            <Tab label="Category Summary" icon={<Assessment />} iconPosition="start" />
                        </Tabs>

                        {/* TAB 1: DETAILED LIST */}
                        {tabValue === 0 && (
                            <Paper sx={{ width: '100%', overflow: 'hidden', borderRadius: 2 }}>
                                {!loadingData && assets.length === 0 ? (
                                    <Box p={6} textAlign="center">
                                        <Box component="img" src="https://cdni.iconscout.com/illustration/premium/thumb/folder-is-empty-4064360-3363921.png" width={200} alt="No Data" sx={{ opacity: 0.5, mb: 2 }} />
                                        <Typography variant="h6" color="textSecondary">No records found matching your criteria.</Typography>
                                    </Box>
                                ) : (
                                    <>
                                        <TableContainer component={Paper} elevation={0} variant="outlined" sx={{ maxHeight: '70vh', borderRadius: 2 }}>
                                            <Table stickyHeader size="small">
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
                                                                Asset Tag
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
                                                                Asset Name
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
                                                            onClick={() => handleSort('category')}
                                                        >
                                                            <Box display="flex" alignItems="center">
                                                                Category
                                                                {getSortIcon('category')}
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
                                                            onClick={() => handleSort('status')}
                                                        >
                                                            <Box display="flex" alignItems="center">
                                                                Status
                                                                {getSortIcon('status')}
                                                            </Box>
                                                        </TableCell>
                                                    </TableRow>
                                                </TableHead>
                                                <TableBody>
                                                    {(loadingData ? Array.from(new Array(5)) : sortedAssets.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)).map((row, index) => (
                                                        <TableRow key={index} hover>
                                                            {loadingData ? (
                                                                <TableCell colSpan={6}><Skeleton animation="wave" /></TableCell>
                                                            ) : (
                                                                <>
                                                                    <TableCell>
                                                                        <Typography variant="body2" fontWeight="bold" sx={{ color: '#000000' }}>
                                                                            {row.miczon_id}
                                                                        </Typography>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Typography variant="body2" fontWeight="500">{row.name}</Typography>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Chip label={row.category} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem' }} />
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Typography variant="body2">{row.custodian_name || <span style={{ color: '#aaa' }}>In Stock</span>}</Typography>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Typography variant="body2">{row.department_name || <span style={{ color: '#aaa' }}>General</span>}</Typography>
                                                                    </TableCell>
                                                                    <TableCell>
                                                                        <Chip
                                                                            label={row.current_status}
                                                                            size="small"
                                                                            color={
                                                                                row.current_status === 'AVAILABLE' ? "primary" :
                                                                                    row.current_status === 'BROKEN' ? "error" :
                                                                                        row.current_status === 'ASSIGNED' ? "primary" : "default"
                                                                            }
                                                                            variant={row.current_status === 'AVAILABLE' ? "filled" : "outlined"}
                                                                        />
                                                                    </TableCell>
                                                                </>
                                                            )}
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </TableContainer>
                                        <TablePagination
                                            className="no-print"
                                            rowsPerPageOptions={[10, 25, 100]}
                                            component="div"
                                            count={sortedAssets.length}
                                            rowsPerPage={rowsPerPage}
                                            page={page}
                                            onPageChange={(_, p) => setPage(p)}
                                            onRowsPerPageChange={(e) => { setRowsPerPage(parseInt(e.target.value, 10)); setPage(0); }}
                                        />
                                    </>
                                )}
                            </Paper>
                        )}

                        {/* TAB 2: CATEGORY SUMMARY */}
                        {tabValue === 1 && (
                            <Paper sx={{ width: '100%', borderRadius: 2, p: 2 }}>
                                <TableContainer>
                                    <Table>
                                        <TableHead>
                                            <TableRow>
                                                <TableCell sx={{ fontWeight: 'bold' }}>Category</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Total Assets</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 'bold', color: 'green' }}>Available</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 'bold', color: '#1976d2' }}>Assigned</TableCell>
                                                <TableCell align="right" sx={{ fontWeight: 'bold' }}>Utilization %</TableCell>
                                            </TableRow>
                                        </TableHead>
                                        <TableBody>
                                            {categoryStats.map((cat, idx) => (
                                                <TableRow key={idx} hover>
                                                    <TableCell component="th" scope="row" sx={{ fontWeight: 'bold' }}>{cat.category || 'Uncategorized'}</TableCell>
                                                    <TableCell align="right">{cat.count}</TableCell>
                                                    <TableCell align="right">{cat.available}</TableCell>
                                                    <TableCell align="right">{cat.assigned}</TableCell>
                                                    <TableCell align="right">
                                                        {cat.count > 0 ? `${((cat.assigned / cat.count) * 100).toFixed(1)}%` : '0%'}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </TableContainer>
                            </Paper>
                        )}
                    </Box>
                </Paper>
            </Container>
        </Box>
    );
}
