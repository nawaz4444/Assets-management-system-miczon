import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { UserContext } from '../App';
import {
    Container, Paper, Typography, TextField, Button, Box, Autocomplete,
    Alert, Grid, CircularProgress, InputAdornment, Snackbar, Divider
} from '@mui/material';
import { fetchAllPages } from '../utils/apiHelpers';

// Icons
import AssignmentIcon from '@mui/icons-material/Assignment';
import PersonIcon from '@mui/icons-material/Person';
import BadgeIcon from '@mui/icons-material/Badge';
import WorkIcon from '@mui/icons-material/Work';
import NotesIcon from '@mui/icons-material/Notes';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import DeviceIcon from '@mui/icons-material/Devices';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';

function AssignAsset({ token }) {
    // --- State Management ---
    const [assets, setAssets] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [selectedAsset, setSelectedAsset] = useState(null);
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [purpose, setPurpose] = useState('');
    const [remarks, setRemarks] = useState('');
    const [assignedBy, setAssignedBy] = useState('');

    // UI State
    const [loading, setLoading] = useState(false);
    const [alert, setAlert] = useState({ open: false, message: '', severity: 'success' });

    const { user } = useContext(UserContext);
    const authConfig = { headers: { Authorization: `Token ${token}` } };
    const API_BASE = 'http://localhost:8000/api';

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const [assetsData, employeesData] = await Promise.all([
                fetchAllPages(`${API_BASE}/assets/`, authConfig),
                fetchAllPages(`${API_BASE}/employees/`, authConfig)
            ]);

            // Filter for available assets only
            setAssets(assetsData.filter(a => a.current_status === 'AVAILABLE'));
            setEmployees(employeesData);
        } catch (err) {
            console.error(err);
        }
    };

    const handleClear = () => {
        setSelectedAsset(null);
        setSelectedEmployee(null);
        setPurpose('');
        setRemarks('');
        setAssignedBy('');
    };

    const handleSubmit = (e) => {
        e.preventDefault();

        if (!selectedAsset || !selectedEmployee) {
            setAlert({ open: true, message: 'Please select both Asset and Employee', severity: 'error' });
            return;
        }

        setLoading(true);

        const payload = {
            asset: selectedAsset.id,
            employee: selectedEmployee.id,
            purpose,
            remarks,
            assigned_by: assignedBy,
            status: 'ASSIGNED'
        };

        if (user && !user.is_superuser) {
            const reqPayload = {
                asset: selectedAsset.id,
                requester: user.employee_details?.id,
                action_type: 'ASSIGN',
                target_employee: selectedEmployee.id,
                remarks: `Purpose: ${purpose}, Assigned By: ${assignedBy}. Notes: ${remarks}`
            };
            axios.post(`${API_BASE}/requests/`, reqPayload, authConfig)
                .then(() => {
                    setAlert({ open: true, message: `Assignment request for ${selectedAsset.miczon_id} submitted for approval.`, severity: 'success' });
                    handleClear();
                    fetchData();
                })
                .catch(err => {
                    console.error("Request Error:", err);
                    setAlert({ open: true, message: 'Failed to submit request.', severity: 'error' });
                })
                .finally(() => setLoading(false));
            return;
        }

        axios.post(`${API_BASE}/assignments/`, payload, authConfig)
            .then(() => {
                setAlert({ open: true, message: `Successfully assigned ${selectedAsset.miczon_id} to ${selectedEmployee.name}`, severity: 'success' });
                handleClear();
                fetchData();
            })
            .catch(err => {
                console.error("Assignment Error:", err);
                const errorText = err.response?.data ? JSON.stringify(err.response.data) : 'Assignment Failed';
                setAlert({ open: true, message: errorText, severity: 'error' });
            })
            .finally(() => setLoading(false));
    };

    const handleCloseAlert = () => setAlert({ ...alert, open: false });

    return (
        <Container maxWidth="lg" sx={{ mt: 6, pb: 8 }}>
            <Paper
                elevation={6}
                sx={{
                    p: 5,
                    borderRadius: 3,
                    borderTop: '6px solid #1976d2',
                    transition: 'transform 0.3s, box-shadow 0.3s',
                    '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: 10
                    }
                }}
            >
                {/* Header Section */}
                <Box mb={4}>
                    <Typography variant="h4" component="h1" sx={{ fontWeight: 800, mb: 1, letterSpacing: '-0.5px', color: '#000000' }}>
                        Assign Asset
                    </Typography>
                    <Typography variant="body1" color="textSecondary">
                        Allocate available devices to employees.
                    </Typography>
                </Box>

                <Box component="form" onSubmit={handleSubmit} noValidate>
                    {/* --- INPUT FIELDS GRID --- */}
                    <Grid container spacing={4}>

                        {/* Row 1: Asset Selection */}
                        <Grid item xs={12} md="auto" sx={{ minWidth: 240 }}>
                            <Autocomplete
                                id="select-asset"
                                options={assets}
                                getOptionLabel={(option) => `${option.miczon_id} - ${option.name}`}
                                value={selectedAsset}
                                onChange={(e, newValue) => setSelectedAsset(newValue)}
                                isOptionEqualToValue={(option, value) => option.id === value.id}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Select Asset"
                                        placeholder="Search ID or Name..."
                                        variant="outlined"
                                        required
                                        fullWidth
                                        size="small"
                                        InputProps={{
                                            ...params.InputProps,
                                            startAdornment: (
                                                <>
                                                    <InputAdornment position="start">
                                                        <DeviceIcon color="primary" />
                                                    </InputAdornment>
                                                    {params.InputProps.startAdornment}
                                                </>
                                            )
                                        }}
                                    />
                                )}
                            />
                        </Grid>

                        {/* Row 1: Employee Selection */}
                        <Grid item xs={12} md="auto" sx={{ minWidth: 240 }}>
                            <Autocomplete
                                id="select-employee"
                                options={employees}
                                getOptionLabel={(option) => `${option.name} (${option.employee_id})`}
                                value={selectedEmployee}
                                onChange={(e, newValue) => setSelectedEmployee(newValue)}
                                isOptionEqualToValue={(option, value) => option.id === value.id}
                                renderInput={(params) => (
                                    <TextField
                                        {...params}
                                        label="Select Employee"
                                        placeholder="Search Name..."
                                        variant="outlined"
                                        required
                                        fullWidth
                                        size="small"
                                        InputProps={{
                                            ...params.InputProps,
                                            startAdornment: (
                                                <>
                                                    <InputAdornment position="start">
                                                        <PersonIcon color="primary" />
                                                    </InputAdornment>
                                                    {params.InputProps.startAdornment}
                                                </>
                                            )
                                        }}
                                    />
                                )}
                            />
                        </Grid>

                        {/* Row 2: Purpose */}
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Purpose"
                                value={purpose}
                                onChange={(e) => setPurpose(e.target.value)}
                                placeholder="e.g. Remote Work, New Joinee"
                                variant="outlined"
                                size="small"
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <WorkIcon color="action" />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Grid>

                        {/* Row 2: Assigned By */}
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Assigned By"
                                value={assignedBy}
                                onChange={(e) => setAssignedBy(e.target.value)}
                                placeholder="Admin Name"
                                variant="outlined"
                                size="small"
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <BadgeIcon color="action" />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Grid>

                        {/* Row 3: Remarks */}
                        <Grid item xs={12}>
                            <TextField
                                fullWidth
                                label="Remarks / Notes"
                                value={remarks}
                                onChange={(e) => setRemarks(e.target.value)}
                                placeholder="Any additional details..."
                                variant="outlined"
                                size="small"
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <NotesIcon color="action" />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Grid>
                    </Grid>

                    {/* --- ACTION BUTTONS (Outside Grid to force bottom position) --- */}
                    <Box sx={{ mt: 5 }}>
                        <Divider sx={{ mb: 3 }} />
                        <Box sx={{ display: 'flex', gap: 2, justifyContent: 'flex-end' }}>
                            <Button
                                variant="outlined"
                                color="error"
                                size="large"
                                onClick={handleClear}
                                startIcon={<DeleteSweepIcon />}
                                sx={{ px: 4, borderRadius: 2 }}
                            >
                                Clear
                            </Button>
                            <Button
                                type="submit"
                                variant="contained"
                                size="large"
                                startIcon={loading ? <CircularProgress size={24} color="inherit" /> : <CheckCircleIcon />}
                                disabled={loading}
                                sx={{
                                    px: 6,
                                }}
                            >
                                {loading ? 'Processing...' : (user?.is_superuser ? 'Confirm Assignment' : 'Request Assignment')}
                            </Button>
                        </Box>
                    </Box>

                </Box>
            </Paper>

            <Snackbar open={alert.open} autoHideDuration={6000} onClose={handleCloseAlert}>
                <Alert onClose={handleCloseAlert} severity={alert.severity} sx={{ width: '100%' }} variant="filled">
                    {alert.message}
                </Alert>
            </Snackbar>
        </Container>
    );
}

export default AssignAsset;