import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Container, Paper, Typography, Box, Grid, FormControl, InputLabel,
    Select, MenuItem, Button, Table, TableBody, TableCell, TableContainer,
    TableHead, TableRow, Chip, InputAdornment, IconButton
} from '@mui/material';
import { Link } from 'react-router-dom';
import { fetchAllPages } from '../utils/apiHelpers';

// Icons
import BusinessIcon from '@mui/icons-material/Business';
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import PrintIcon from '@mui/icons-material/Print';
import SearchIcon from '@mui/icons-material/Search';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import AssessmentIcon from '@mui/icons-material/Assessment';

function InspectionReport({ token }) {
    // --- State ---
    const [departments, setDepartments] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [selectedDept, setSelectedDept] = useState('');
    const [selectedEmp, setSelectedEmp] = useState('');

    // --- Data ---
    const [assets, setAssets] = useState([]);
    const [loading, setLoading] = useState(false);

    const authConfig = {
        headers: { Authorization: `Token ${token}` }
    };

    useEffect(() => {
        // Fetch Departments
        axios.get('http://127.0.0.1:8000/api/departments/', authConfig)
            .then(res => setDepartments(res.data))
            .catch(err => console.error(err));

        // Fetch Employees - get all pages
        fetchAllPages('http://127.0.0.1:8000/api/employees/', authConfig)
            .then(res => setEmployees(res))
            .catch(err => console.error(err));
    }, []);

    const fetchReport = async () => {
        setLoading(true);
        try {
            const params = {};
            if (selectedDept) params.department = selectedDept;
            if (selectedEmp) params.custodian = selectedEmp;

            const allAssets = await fetchAllPages('http://127.0.0.1:8000/api/assets/', authConfig, params);
            setAssets(allAssets);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    const handlePrint = () => {
        window.print();
    };

    // Filter employees based on Dept
    const filteredEmployees = selectedDept
        ? employees.filter(e => e.department === selectedDept)
        : employees;

    // Helper to get status color
    const getStatusColor = (status) => {
        if (!status) return 'default';
        const s = status.toLowerCase();
        if (s === 'ok' || s === 'good' || s === 'available') return 'success';
        if (s === 'damaged' || s === 'broken') return 'error';
        if (s === 'needs repair') return 'warning';
        if (s === 'assigned') return 'primary';
        return 'default';
    };

    return (
        <Container maxWidth="xl" sx={{ mt: 6, pb: 8 }}>

            {/* Print Styles */}
            <style>
                {`
                    @media print {
                        .no-print { display: none !important; }
                        .print-only { display: block !important; }
                        body { background-color: white; }
                        .MuiPaper-root { box-shadow: none !important; border: 1px solid #ccc; }
                    }
                `}
            </style>

            <Paper
                elevation={6}
                sx={{
                    p: 4,
                    borderRadius: 3,
                    borderTop: '6px solid #1976d2', // Brand Bar
                    transition: 'transform 0.3s, box-shadow 0.3s',
                    '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: 10
                    }
                }}
            >
                {/* Header */}
                <Box mb={4} display="flex" justifyContent="space-between" alignItems="center" className="no-print">
                    <Box display="flex" alignItems="center">
                        <IconButton component={Link} to="/inspection" sx={{ mr: 2, color: 'primary.main' }}>
                            <ArrowBackIcon fontSize="large" />
                        </IconButton>
                        <AssessmentIcon sx={{ fontSize: 40, mr: 2, color: 'primary.main' }} />
                        <Box>
                            <Typography variant="h4" component="h1" sx={{ fontWeight: 800, letterSpacing: '-0.5px', color: '#000000' }}>
                                Inspection Reports
                            </Typography>
                            <Typography variant="body1" color="textSecondary">
                                Generate and view asset condition reports.
                            </Typography>
                        </Box>
                    </Box>
                </Box>

                {/* Filters Section */}
                <Box className="no-print" mb={4}>
                    <Grid container spacing={3} alignItems="center">
                        <Grid item xs={12} md={4}>
                            <FormControl fullWidth variant="outlined">
                                <InputLabel>Department</InputLabel>
                                <Select
                                    value={selectedDept}
                                    label="Department"
                                    onChange={(e) => setSelectedDept(e.target.value)}
                                    startAdornment={<InputAdornment position="start"><BusinessIcon color="action" /></InputAdornment>}
                                >
                                    <MenuItem value=""><em>All Departments</em></MenuItem>
                                    {departments.map(d => <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <FormControl fullWidth variant="outlined">
                                <InputLabel>Employee</InputLabel>
                                <Select
                                    value={selectedEmp}
                                    label="Employee"
                                    onChange={(e) => setSelectedEmp(e.target.value)}
                                    startAdornment={<InputAdornment position="start"><AssignmentIndIcon color="action" /></InputAdornment>}
                                >
                                    <MenuItem value=""><em>All Employees</em></MenuItem>
                                    {filteredEmployees.map(e => <MenuItem key={e.id} value={e.id}>{e.name}</MenuItem>)}
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} md={4} display="flex" gap={2}>
                            <Button
                                variant="contained"
                                startIcon={<SearchIcon />}
                                onClick={fetchReport}
                                disabled={loading}
                                fullWidth
                                size="large"
                            >
                                {loading ? 'Loading...' : 'Generate'}
                            </Button>
                            <Button
                                variant="outlined"
                                color="secondary"
                                startIcon={<PrintIcon />}
                                onClick={handlePrint}
                                fullWidth
                                size="large"
                                sx={{ fontWeight: 'bold', borderWidth: 2, '&:hover': { borderWidth: 2 } }}
                            >
                                Print
                            </Button>
                        </Grid>
                    </Grid>
                </Box>

                {/* Report Table */}
                <Box>
                    {/* Printable Header (Visible only when printing) */}
                    <Box sx={{ display: 'none', flexDirection: 'column', alignItems: 'center', mb: 3 }} className="print-only">
                        <Typography variant="h5" fontWeight="bold">Asset Inspection Report</Typography>
                        <Typography variant="subtitle1">{new Date().toLocaleDateString()}</Typography>
                    </Box>

                    {assets.length === 0 && !loading ? (
                        <Box p={6} textAlign="center" border="1px dashed #ccc" borderRadius={2} bgcolor="#fafafa">
                            <Typography color="textSecondary" variant="h6">
                                No data generated. Select filters and click "Generate".
                            </Typography>
                        </Box>
                    ) : (
                        <TableContainer component={Paper} elevation={0} variant="outlined" sx={{ borderRadius: 2 }}>
                            <Table size="medium">
                                <TableHead>
                                    <TableRow>
                                        <TableCell sx={{ bgcolor: '#e3f2fd', fontWeight: 'bold' }}>Asset Info</TableCell>
                                        <TableCell sx={{ bgcolor: '#e3f2fd', fontWeight: 'bold' }}>Last Inspection</TableCell>
                                        <TableCell sx={{ bgcolor: '#e3f2fd', fontWeight: 'bold' }}>Status Found</TableCell>
                                        <TableCell sx={{ bgcolor: '#e3f2fd', fontWeight: 'bold' }}>Inspected By</TableCell>
                                        <TableCell sx={{ bgcolor: '#e3f2fd', fontWeight: 'bold' }} width="30%">Remarks</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {assets.map((asset) => {
                                        const lastInsp = asset.latest_inspection;
                                        const statusLabel = lastInsp ? lastInsp.status_found : asset.current_status;
                                        const dateLabel = lastInsp ? new Date(lastInsp.date).toLocaleDateString() : (asset.last_inspection_date || 'N/A');
                                        const inspector = lastInsp ? lastInsp.inspector_name : 'N/A';
                                        const notes = lastInsp ? lastInsp.notes : 'No recent inspection log';

                                        return (
                                            <TableRow key={asset.id} hover>
                                                <TableCell>
                                                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#000000' }}>
                                                        {asset.name}
                                                    </Typography>
                                                    <Typography variant="caption" color="textSecondary">
                                                        {asset.miczon_id}
                                                    </Typography>
                                                </TableCell>
                                                <TableCell>{dateLabel}</TableCell>
                                                <TableCell>
                                                    <Chip
                                                        label={statusLabel}
                                                        color={getStatusColor(statusLabel)}
                                                        size="small"
                                                        variant={statusLabel === 'AVAILABLE' || statusLabel === 'Good' ? 'filled' : 'outlined'}
                                                        sx={{ fontWeight: 'bold' }}
                                                    />
                                                </TableCell>
                                                <TableCell>{inspector}</TableCell>
                                                <TableCell>
                                                    <Typography variant="body2" sx={{ fontStyle: 'italic', color: 'text.secondary' }}>
                                                        {notes}
                                                    </Typography>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </Box>
            </Paper>
        </Container>
    );
}

export default InspectionReport;