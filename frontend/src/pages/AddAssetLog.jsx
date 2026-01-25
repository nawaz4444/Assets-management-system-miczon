import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Container, Paper, TextField, Button, Typography, Box,
    MenuItem, FormControl, InputLabel, Select, Alert,
    Snackbar, Grid, InputAdornment, Divider, Table, TableBody,
    TableCell, TableContainer, TableHead, TableRow, Radio,
    RadioGroup, FormControlLabel, Chip
} from '@mui/material';
import { Link } from 'react-router-dom';
import { fetchAllPages } from '../utils/apiHelpers';

// Icons
import AssignmentIndIcon from '@mui/icons-material/AssignmentInd';
import BusinessIcon from '@mui/icons-material/Business';
import SaveIcon from '@mui/icons-material/Save';
import FactCheckIcon from '@mui/icons-material/FactCheck';
import AssessmentIcon from '@mui/icons-material/Assessment';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import NotesIcon from '@mui/icons-material/Notes';

function AddAssetLog({ token }) {
    // --- State ---
    const [departments, setDepartments] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [assets, setAssets] = useState([]);

    // --- Selections ---
    const [selectedDept, setSelectedDept] = useState('');
    const [selectedEmp, setSelectedEmp] = useState('');

    // --- Inspection Data ---
    const [inspections, setInspections] = useState({});

    // --- UI State ---
    const [loading, setLoading] = useState(false);
    const [alert, setAlert] = useState({ open: false, message: '', severity: 'success' });

    const authConfig = {
        headers: { Authorization: `Token ${token}` }
    };

    // 1. Fetch Departments and Employees on Load
    useEffect(() => {
        axios.get('http://127.0.0.1:8000/api/departments/', authConfig)
            .then(res => setDepartments(res.data))
            .catch(err => console.error("Error fetching departments", err));

        fetchAllPages('http://127.0.0.1:8000/api/employees/', authConfig)
            .then(res => setEmployees(res))
            .catch(err => console.error("Error fetching employees", err));
    }, []);

    // 2. Fetch Assets when Filters Change
    useEffect(() => {
        fetchAssets();
    }, [selectedDept, selectedEmp]);

    const fetchAssets = async () => {
        if (!selectedDept && !selectedEmp) {
            setAssets([]);
            setInspections({});
            return;
        }

        setLoading(true);
        try {
            const params = {};
            if (selectedDept) params.department = selectedDept;
            if (selectedEmp) params.custodian = selectedEmp;

            const fetchedAssets = await fetchAllPages('http://127.0.0.1:8000/api/assets/', authConfig, params);
            setAssets(fetchedAssets);

            // Preserve existing inspection data if any, otherwise init new
            setInspections(prev => {
                const newState = { ...prev };
                fetchedAssets.forEach(a => {
                    if (!newState[a.id]) {
                        newState[a.id] = { status: 'Good', notes: '' };
                    }
                });
                return newState;
            });
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    // Filter employees for dropdown based on selected department
    const filteredEmployees = selectedDept
        ? employees.filter(e => e.department === selectedDept)
        : employees;

    // Handlers
    const handleInspectionChange = (assetId, field, value) => {
        setInspections(prev => ({
            ...prev,
            [assetId]: {
                ...prev[assetId],
                [field]: value
            }
        }));
    };

    const handleReset = () => {
        setSelectedDept('');
        setSelectedEmp('');
        setAssets([]);
        setInspections({});
    };

    const handleSubmit = async () => {
        if (assets.length === 0) {
            setAlert({ open: true, message: 'No assets to inspect!', severity: 'warning' });
            return;
        }

        setLoading(true);

        const requests = assets.map(asset => {
            const data = inspections[asset.id];
            const payload = {
                asset: asset.id,
                status_found: data.status,
                notes: data.notes,
                inspector_name: 'Admin'
            };
            return axios.post('http://127.0.0.1:8000/api/inspections/', payload, authConfig);
        });

        try {
            await Promise.all(requests);
            setAlert({ open: true, message: 'All inspections submitted successfully!', severity: 'success' });
            handleReset(); // Clear form after success
        } catch (error) {
            console.error(error);
            setAlert({ open: true, message: 'Some inspections failed to save.', severity: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const handleCloseAlert = () => setAlert({ ...alert, open: false });

    return (
        <Container maxWidth="xl" sx={{ mt: 6, pb: 8 }}>

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
                {/* --- HEADER --- */}
                <Box mb={4} display="flex" justifyContent="space-between" alignItems="center">
                    <Box display="flex" alignItems="center" gap={2}>
                        <FactCheckIcon color="primary" sx={{ fontSize: 40 }} />
                        <Box>
                            <Typography variant="h4" fontWeight="800" sx={{ letterSpacing: '-0.5px', color: '#000000' }}>
                                Asset Inspection
                            </Typography>
                            <Typography variant="body1" color="textSecondary">
                                Select a department and employee to inspect their assigned assets.
                            </Typography>
                        </Box>
                    </Box>
                    <Button
                        variant="outlined"
                        color="secondary"
                        component={Link}
                        to="/inspection-report"
                        startIcon={<AssessmentIcon />}
                        sx={{ textTransform: 'none', fontWeight: 'bold', borderWidth: 2, '&:hover': { borderWidth: 2 } }}
                    >
                        View Reports
                    </Button>
                </Box>

                <Divider sx={{ mb: 4 }} />

                {/* --- TOP SECTION: FILTERS --- */}
                <Grid container spacing={2} alignItems="center" sx={{ mb: 4 }}>
                    <Grid item xs={12} md="auto" sx={{ minWidth: 240 }}>
                        <FormControl fullWidth variant="outlined" size="small">
                            <InputLabel id="dept-label">Select Department</InputLabel>
                            <Select
                                labelId="dept-label"
                                label="Select Department"
                                value={selectedDept}
                                onChange={(e) => setSelectedDept(e.target.value)}
                                size="small"
                                startAdornment={
                                    <InputAdornment position="start">
                                        <BusinessIcon color="action" />
                                    </InputAdornment>
                                }
                            >
                                {departments.map(d => (
                                    <MenuItem key={d.id} value={d.id}>{d.name}</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>

                    <Grid item xs={12} md="auto" sx={{ minWidth: 240 }}>
                        <FormControl fullWidth variant="outlined" size="small">
                            <InputLabel id="emp-label">Select Employee</InputLabel>
                            <Select
                                labelId="emp-label"
                                label="Select Employee"
                                value={selectedEmp}
                                onChange={(e) => setSelectedEmp(e.target.value)}
                                size="small"
                                startAdornment={
                                    <InputAdornment position="start">
                                        <AssignmentIndIcon color="action" />
                                    </InputAdornment>
                                }
                            >
                                <MenuItem value="">
                                    <em>All Employees</em>
                                </MenuItem>
                                {filteredEmployees.map(e => (
                                    <MenuItem key={e.id} value={e.id}>{e.name} ({e.employee_id})</MenuItem>
                                ))}
                            </Select>
                        </FormControl>
                    </Grid>

                    <Grid item xs={12} md="auto">
                        <Button
                            fullWidth
                            variant="outlined"
                            color="inherit"
                            startIcon={<RestartAltIcon />}
                            onClick={handleReset}
                            sx={{ height: '56px', borderColor: '#ccc', color: '#666' }}
                        >
                            Reset
                        </Button>
                    </Grid>
                </Grid>

                {/* --- BOTTOM SECTION: TABLE --- */}
                {(selectedDept || selectedEmp) && (
                    <Box>
                        {/* Table Header / Title */}
                        <Box sx={{ p: 2, bgcolor: '#e3f2fd', borderTopLeftRadius: 8, borderTopRightRadius: 8, borderBottom: '1px solid #bbdefb' }}>
                            <Typography variant="h6" fontWeight="bold" color="primary.dark">
                                Assigned Assets ({assets.length})
                            </Typography>
                        </Box>

                        {assets.length === 0 && !loading ? (
                            <Box p={6} textAlign="center" border="1px dashed #ccc" borderRadius={2} mt={2}>
                                <Typography color="textSecondary">No assets found for the selected criteria.</Typography>
                            </Box>
                        ) : (
                            <TableContainer component={Paper} elevation={0} variant="outlined" sx={{ borderTopLeftRadius: 0, borderTopRightRadius: 0 }}>
                                <Table stickyHeader>
                                    <TableHead>
                                        <TableRow>
                                            <TableCell sx={{ fontWeight: 'bold', width: '25%', bgcolor: '#f5f5f5' }}>Asset Details</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', width: '40%', bgcolor: '#f5f5f5' }}>Condition Check</TableCell>
                                            <TableCell sx={{ fontWeight: 'bold', width: '35%', bgcolor: '#f5f5f5' }}>Inspection Notes</TableCell>
                                        </TableRow>
                                    </TableHead>
                                    <TableBody>
                                        {assets.map((asset) => (
                                            <TableRow key={asset.id} hover>
                                                {/* 1. Asset Details */}
                                                <TableCell>
                                                    <Typography variant="subtitle2" fontWeight="bold" sx={{ color: '#000000' }}>{asset.name}</Typography>
                                                    <Typography variant="caption" color="textSecondary" display="block">
                                                        ID: {asset.miczon_id}
                                                    </Typography>
                                                    <Chip label={asset.category} size="small" variant="outlined" sx={{ mt: 0.5, fontSize: '0.7rem' }} />
                                                </TableCell>

                                                {/* 2. Condition Status */}
                                                <TableCell>
                                                    <FormControl component="fieldset">
                                                        <RadioGroup
                                                            row
                                                            value={inspections[asset.id]?.status || 'Good'}
                                                            onChange={(e) => handleInspectionChange(asset.id, 'status', e.target.value)}
                                                        >
                                                            <FormControlLabel
                                                                value="Good"
                                                                control={<Radio size="small" color="success" />}
                                                                label={<Typography variant="body2">Good</Typography>}
                                                            />
                                                            <FormControlLabel
                                                                value="Needs Repair"
                                                                control={<Radio size="small" color="warning" />}
                                                                label={<Typography variant="body2">Repair</Typography>}
                                                            />
                                                            <FormControlLabel
                                                                value="Damaged"
                                                                control={<Radio size="small" color="error" />}
                                                                label={<Typography variant="body2">Damaged</Typography>}
                                                            />
                                                            <FormControlLabel
                                                                value="Lost"
                                                                control={<Radio size="small" sx={{ color: 'grey.800', '&.Mui-checked': { color: 'grey.900' } }} />}
                                                                label={<Typography variant="body2">Lost</Typography>}
                                                            />
                                                        </RadioGroup>
                                                    </FormControl>
                                                </TableCell>

                                                {/* 3. Remarks */}
                                                <TableCell>
                                                    <TextField
                                                        fullWidth
                                                        size="small"
                                                        placeholder="Add notes..."
                                                        variant="outlined"
                                                        value={inspections[asset.id]?.notes || ''}
                                                        onChange={(e) => handleInspectionChange(asset.id, 'notes', e.target.value)}
                                                        InputProps={{
                                                            startAdornment: (
                                                                <InputAdornment position="start">
                                                                    <NotesIcon fontSize="small" color="action" />
                                                                </InputAdornment>
                                                            ),
                                                        }}
                                                    />
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </TableContainer>
                        )}

                        {/* Footer Actions */}
                        {assets.length > 0 && (
                            <Box sx={{ mt: 3, display: 'flex', justifyContent: 'flex-end' }}>
                                <Button
                                    variant="contained"
                                    size="large"
                                    startIcon={<SaveIcon />}
                                    onClick={handleSubmit}
                                    disabled={loading}
                                    sx={{
                                        px: 6,
                                        textTransform: 'none',
                                        fontSize: '1rem',
                                        fontWeight: 'bold'
                                    }}
                                >
                                    {loading ? 'Submitting...' : 'Submit Inspection'}
                                </Button>
                            </Box>
                        )}
                    </Box>
                )}
            </Paper>

            <Snackbar open={alert.open} autoHideDuration={4000} onClose={handleCloseAlert}>
                <Alert onClose={handleCloseAlert} severity={alert.severity} sx={{ width: '100%' }} variant="filled">
                    {alert.message}
                </Alert>
            </Snackbar>
        </Container>
    );
}

export default AddAssetLog;