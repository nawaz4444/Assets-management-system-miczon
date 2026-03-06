import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import { UserContext } from '../App';
import {
    Container, Paper, Typography, TextField, Button, Box, Autocomplete, Alert,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Checkbox,
    Card, CardContent, Grid, Divider, Chip, Stepper, Step, StepLabel,
    CircularProgress, InputAdornment, Snackbar
} from '@mui/material';
import { fetchAllPages } from '../utils/apiHelpers';

// Icons
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import PersonIcon from '@mui/icons-material/Person';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import BuildIcon from '@mui/icons-material/Build'; // For Condition
import NotesIcon from '@mui/icons-material/Notes';
import BadgeIcon from '@mui/icons-material/Badge';

function ReturnAsset({ token }) {
    // --- Data States ---
    const [employees, setEmployees] = useState([]);
    const [allAssets, setAllAssets] = useState([]);

    // --- UI States ---
    const [activeStep, setActiveStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);

    // --- Step 1: Selection ---
    const [selectedEmployee, setSelectedEmployee] = useState(null);
    const [employeeAssets, setEmployeeAssets] = useState([]);
    const [selectedAssetsToReturn, setSelectedAssetsToReturn] = useState([]);

    // --- Step 2: Return Details ---
    const [returnDetails, setReturnDetails] = useState({});

    // --- Auth context ---
    const { user } = useContext(UserContext);

    const authConfig = { headers: { Authorization: `Token ${token}` } };
    const API_BASE = 'http://localhost:8000/api';
    const steps = ['Select Employee & Assets', 'Enter Return Details', 'Confirm'];

    useEffect(() => {
        if (token) {
            fetchData();
        }
    }, [token]);

    // Handle initial selection for non-superusers
    useEffect(() => {
        if (user && !user.is_superuser && user.employee_details && employees.length > 0) {
            const myProfile = employees.find(e => e.id === user.employee_details.id);
            if (myProfile) {
                setSelectedEmployee(myProfile);
            }
        }
    }, [user, employees]);

    // 🚀 FIXED: Fetch ALL pages for employees and assets
    const fetchData = async () => {
        setLoading(true);
        try {
            const [employeesData, assetsData] = await Promise.all([
                fetchAllPages(`${API_BASE}/employees/`, authConfig),
                fetchAllPages(`${API_BASE}/assets/`, authConfig)
            ]);

            setEmployees(employeesData);
            setAllAssets(assetsData);
        } catch (err) {
            console.error("Error fetching data:", err);
        } finally {
            setLoading(false);
        }
    };

    // Filter assets when employee changes
    useEffect(() => {
        if (selectedEmployee) {
            // Filter logic: Check if asset is assigned to this employee
            const empAssets = allAssets.filter(asset =>
                // We check both ID (integer) and explicit match just in case
                (asset.custodian === selectedEmployee.id || asset.custodian?.id === selectedEmployee.id) &&
                asset.current_status === 'ASSIGNED'
            );
            setEmployeeAssets(empAssets);
            setSelectedAssetsToReturn([]);
        } else {
            setEmployeeAssets([]);
        }
    }, [selectedEmployee, allAssets]);

    // Handle Checkbox Toggle
    const handleToggleAsset = (assetId) => {
        const selectedIndex = selectedAssetsToReturn.indexOf(assetId);
        let newSelected = [];

        if (selectedIndex === -1) {
            newSelected = newSelected.concat(selectedAssetsToReturn, assetId);
        } else if (selectedIndex === 0) {
            newSelected = newSelected.concat(selectedAssetsToReturn.slice(1));
        } else if (selectedIndex === selectedAssetsToReturn.length - 1) {
            newSelected = newSelected.concat(selectedAssetsToReturn.slice(0, -1));
        } else if (selectedIndex > 0) {
            newSelected = newSelected.concat(
                selectedAssetsToReturn.slice(0, selectedIndex),
                selectedAssetsToReturn.slice(selectedIndex + 1),
            );
        }
        setSelectedAssetsToReturn(newSelected);
    };

    // Handle "Select All"
    const handleSelectAll = (event) => {
        if (event.target.checked) {
            const newSelecteds = employeeAssets.map((n) => n.id);
            setSelectedAssetsToReturn(newSelecteds);
            return;
        }
        setSelectedAssetsToReturn([]);
    };

    // Proceed to Step 2
    const handleNext = () => {
        if (activeStep === 0) {
            if (selectedAssetsToReturn.length === 0) {
                setMessage({ type: 'warning', text: 'Please select at least one asset to return.' });
                return;
            }
            // Initialize details
            const initialDetails = {};
            const today = new Date().toISOString().split('T')[0];

            selectedAssetsToReturn.forEach(id => {
                initialDetails[id] = {
                    returned_by: 'Admin',
                    condition: 'Good',
                    remarks: '',
                    returned_date: today
                };
            });
            setReturnDetails(initialDetails);
            setMessage(null);
        }
        setActiveStep((prev) => prev + 1);
    };

    const handleBack = () => {
        setActiveStep((prev) => prev - 1);
    };

    // Handle Detail Change
    const handleDetailChange = (assetId, field, value) => {
        setReturnDetails(prev => ({
            ...prev,
            [assetId]: {
                ...prev[assetId],
                [field]: value
            }
        }));
    };

    // Submit Returns
    const handleSubmit = async () => {
        setLoading(true);
        setMessage(null);

        try {
            const promises = selectedAssetsToReturn.map(assetId => {
                const asset = allAssets.find(a => a.id === assetId);
                const details = returnDetails[assetId];

                // If user is not superuser, create a request for approval
                if (user && !user.is_superuser) {
                    const payload = {
                        asset: asset.id,
                        requester: user.employee_details?.id,
                        action_type: 'RETURN',
                        remarks: `Date: ${details.returned_date}, By: ${details.returned_by}, Cond: ${details.condition}. ${details.remarks}`
                    };
                    return axios.post(`${API_BASE}/requests/`, payload, authConfig);
                }

                // Superuser Logic: Existing direct update
                if (asset.active_assignment_id) {
                    const payload = {
                        status: 'RETURNED',
                        returned_by: details.returned_by,
                        returned_date: details.returned_date,
                        condition: details.condition,
                        remarks: details.remarks
                    };
                    return axios.patch(
                        `${API_BASE}/assignments/${asset.active_assignment_id}/`,
                        payload, authConfig
                    );
                } else {
                    const returnNote = `[RETURNED] Date: ${details.returned_date}, By: ${details.returned_by}, Cond: ${details.condition}. ${details.remarks}`;
                    const payload = {
                        custodian: null,
                        current_status: 'AVAILABLE',
                        remarks: asset.remarks ? `${asset.remarks}\n${returnNote}` : returnNote
                    };
                    return axios.patch(
                        `${API_BASE}/assets/${asset.id}/`,
                        payload, authConfig
                    );
                }
            });

            await Promise.all(promises);
            const successText = (user && !user.is_superuser)
                ? `Return requests for ${selectedAssetsToReturn.length} asset(s) submitted for approval!`
                : `Successfully returned ${selectedAssetsToReturn.length} asset(s)!`;
            setMessage({ type: 'success', text: successText });

            // Refresh Data
            fetchData();

            // Reset UI
            setActiveStep(0);
            setSelectedEmployee(null);
            setSelectedAssetsToReturn([]);

        } catch (err) {
            console.error(err);
            setMessage({ type: 'error', text: 'Failed to process returns.' });
        } finally {
            setLoading(false);
        }
    };

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
                {/* Header */}
                <Box mb={4}>
                    <Typography variant="h4" component="h1" sx={{ fontWeight: 800, mb: 1, letterSpacing: '-0.5px', color: '#000000' }}>
                        Return Assets
                    </Typography>
                    <Typography variant="body1" color="textSecondary">
                        Process asset returns and update inventory status.
                    </Typography>
                </Box>

                <Stepper activeStep={activeStep} sx={{ mb: 5 }} alternativeLabel>
                    {steps.map((label) => <Step key={label}><StepLabel>{label}</StepLabel></Step>)}
                </Stepper>

                {/* --- STEP 1: SELECT EMPLOYEE & ASSETS --- */}
                {activeStep === 0 && (
                    <Box>
                        <Grid container spacing={4}>
                            {(!user?.is_superuser && user?.employee_details) ? (
                                <Grid item xs={12}>
                                    <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
                                        Processing return for: <strong>{user.employee_details.name} ({user.employee_details.employee_id})</strong>
                                    </Alert>
                                </Grid>
                            ) : (
                                <Grid item xs={12} md="auto" sx={{ minWidth: 240 }}>
                                    <Autocomplete
                                        options={employees}
                                        getOptionLabel={(option) => `${option.name} (${option.employee_id})`}
                                        value={selectedEmployee}
                                        onChange={(e, newValue) => setSelectedEmployee(newValue)}
                                        renderInput={(params) => (
                                            <TextField
                                                {...params}
                                                label="Select Employee"
                                                placeholder="Search by Name or ID"
                                                fullWidth
                                                variant="outlined"
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
                            )}
                        </Grid>

                        {selectedEmployee && (
                            <Box mt={4}>
                                <Typography variant="h6" gutterBottom color="textSecondary" sx={{ mb: 2 }}>
                                    Assets assigned to <strong>{selectedEmployee.name}</strong>:
                                </Typography>

                                {employeeAssets.length > 0 ? (
                                    <TableContainer component={Paper} variant="outlined" sx={{ borderRadius: 2 }}>
                                        <Table size="medium">
                                            <TableHead sx={{ bgcolor: '#e3f2fd' }}>
                                                <TableRow>
                                                    <TableCell padding="checkbox">
                                                        <Checkbox
                                                            indeterminate={selectedAssetsToReturn.length > 0 && selectedAssetsToReturn.length < employeeAssets.length}
                                                            checked={employeeAssets.length > 0 && selectedAssetsToReturn.length === employeeAssets.length}
                                                            onChange={handleSelectAll}
                                                            color="primary"
                                                        />
                                                    </TableCell>
                                                    <TableCell><strong>ID</strong></TableCell>
                                                    <TableCell><strong>Device Name</strong></TableCell>
                                                    <TableCell><strong>Category</strong></TableCell>
                                                    <TableCell><strong>Specs</strong></TableCell>
                                                </TableRow>
                                            </TableHead>
                                            <TableBody>
                                                {employeeAssets.map((asset) => {
                                                    const isSelected = selectedAssetsToReturn.indexOf(asset.id) !== -1;
                                                    return (
                                                        <TableRow
                                                            key={asset.id}
                                                            hover
                                                            onClick={() => handleToggleAsset(asset.id)}
                                                            role="checkbox"
                                                            aria-checked={isSelected}
                                                            selected={isSelected}
                                                            sx={{ cursor: 'pointer' }}
                                                        >
                                                            <TableCell padding="checkbox">
                                                                <Checkbox checked={isSelected} color="primary" />
                                                            </TableCell>
                                                            <TableCell><Typography fontWeight="bold" sx={{ color: '#000000' }}>{asset.miczon_id}</Typography></TableCell>
                                                            <TableCell><Typography sx={{ color: '#000000' }}>{asset.name}</Typography></TableCell>
                                                            <TableCell><Chip label={asset.category} size="small" variant="outlined" /></TableCell>
                                                            <TableCell sx={{ maxWidth: 200, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: 'text.secondary' }}>
                                                                {asset.specifications}
                                                            </TableCell>
                                                        </TableRow>
                                                    );
                                                })}
                                            </TableBody>
                                        </Table>
                                    </TableContainer>
                                ) : (
                                    <Alert severity="info" variant="outlined" sx={{ borderRadius: 2 }}>
                                        No active assets found for this employee.
                                    </Alert>
                                )}
                            </Box>
                        )}
                    </Box>
                )}

                {/* --- STEP 2: ENTER DETAILS --- */}
                {activeStep === 1 && (
                    <Box>
                        <Alert severity="info" sx={{ mb: 3, borderRadius: 2 }}>
                            Please enter return condition and details for the {selectedAssetsToReturn.length} selected asset(s).
                        </Alert>

                        <Grid container spacing={3}>
                            {selectedAssetsToReturn.map(assetId => {
                                const asset = allAssets.find(a => a.id === assetId);
                                const details = returnDetails[assetId] || {};

                                return (
                                    <Grid item xs={12} key={assetId}>
                                        <Card variant="outlined" sx={{ borderRadius: 2, borderColor: '#e0e0e0', boxShadow: 'none', '&:hover': { borderColor: '#1976d2' } }}>
                                            <CardContent>
                                                <Grid container spacing={3} alignItems="center">
                                                    {/* Asset Info Column */}
                                                    <Grid item xs={12} md={3} sx={{ borderRight: { md: '1px solid #eee' } }}>
                                                        <Typography variant="h6" sx={{ color: '#000000' }} fontWeight="bold">
                                                            {asset.miczon_id}
                                                        </Typography>
                                                        <Typography variant="body1" fontWeight="500" sx={{ color: '#000000' }}>{asset.name}</Typography>
                                                        <Chip label={asset.category} size="small" sx={{ mt: 1 }} />
                                                    </Grid>

                                                    {/* Input Fields Column */}
                                                    <Grid item xs={12} md={9}>
                                                        <Grid container spacing={2}>
                                                            <Grid item xs={12} sm={6} md={3}>
                                                                <TextField
                                                                    label="Return Date"
                                                                    type="date"
                                                                    fullWidth
                                                                    size="small"
                                                                    InputLabelProps={{ shrink: true }}
                                                                    value={details.returned_date}
                                                                    onChange={(e) => handleDetailChange(assetId, 'returned_date', e.target.value)}
                                                                    InputProps={{
                                                                        startAdornment: <InputAdornment position="start"><CalendarTodayIcon fontSize="small" /></InputAdornment>
                                                                    }}
                                                                />
                                                            </Grid>
                                                            <Grid item xs={12} sm={6} md={3}>
                                                                <TextField
                                                                    label="Received By"
                                                                    fullWidth
                                                                    size="small"
                                                                    value={details.returned_by}
                                                                    onChange={(e) => handleDetailChange(assetId, 'returned_by', e.target.value)}
                                                                    InputProps={{
                                                                        startAdornment: <InputAdornment position="start"><BadgeIcon fontSize="small" /></InputAdornment>
                                                                    }}
                                                                />
                                                            </Grid>
                                                            <Grid item xs={12} sm={6} md={3}>
                                                                <TextField
                                                                    select
                                                                    label="Condition"
                                                                    fullWidth
                                                                    size="small"
                                                                    SelectProps={{ native: true }}
                                                                    value={details.condition}
                                                                    onChange={(e) => handleDetailChange(assetId, 'condition', e.target.value)}
                                                                    InputProps={{
                                                                        startAdornment: <InputAdornment position="start"><BuildIcon fontSize="small" /></InputAdornment>
                                                                    }}
                                                                >
                                                                    <option value="Good">Good</option>
                                                                    <option value="Damaged">Damaged</option>
                                                                    <option value="Needs Repair">Repair</option>
                                                                    <option value="Scrap">Scrap</option>
                                                                </TextField>
                                                            </Grid>
                                                            <Grid item xs={12} sm={6} md={3}>
                                                                <TextField
                                                                    label="Remarks"
                                                                    fullWidth
                                                                    size="small"
                                                                    value={details.remarks}
                                                                    onChange={(e) => handleDetailChange(assetId, 'remarks', e.target.value)}
                                                                    InputProps={{
                                                                        startAdornment: <InputAdornment position="start"><NotesIcon fontSize="small" /></InputAdornment>
                                                                    }}
                                                                />
                                                            </Grid>
                                                        </Grid>
                                                    </Grid>
                                                </Grid>
                                            </CardContent>
                                        </Card>
                                    </Grid>
                                );
                            })}
                        </Grid>
                    </Box>
                )}

                {/* --- STEP 3: LOADING/SUCCESS --- */}
                {activeStep === 2 && (
                    <Box display="flex" flexDirection="column" alignItems="center" py={8}>
                        {loading ? (
                            <>
                                <CircularProgress size={60} thickness={4} />
                                <Typography variant="h6" sx={{ mt: 3, color: 'text.secondary' }}>Processing Returns...</Typography>
                            </>
                        ) : (
                            <>
                                <CheckCircleIcon color="success" sx={{ fontSize: 80, mb: 2 }} />
                                <Typography variant="h5" fontWeight="bold">Success!</Typography>
                                <Typography color="textSecondary">The assets have been successfully returned.</Typography>
                            </>
                        )}
                    </Box>
                )}

                {/* --- FOOTER BUTTONS --- */}
                <Box sx={{ mt: 5 }}>
                    <Divider sx={{ mb: 3 }} />
                    <Box sx={{ display: 'flex', flexDirection: 'row' }}>

                        {/* Back Button */}
                        {activeStep === 1 && (
                            <Button
                                color="inherit"
                                onClick={handleBack}
                                startIcon={<ArrowBackIcon />}
                                variant="outlined"
                                sx={{ px: 3, borderRadius: 2 }}
                            >
                                Back
                            </Button>
                        )}

                        <Box sx={{ flex: '1 1 auto' }} />

                        {/* Next Button (Step 0) */}
                        {activeStep === 0 && selectedAssetsToReturn.length > 0 && (
                            <Button
                                onClick={handleNext}
                                variant="contained"
                                endIcon={<ArrowForwardIcon />}
                                sx={{
                                    px: 4,
                                }}
                            >
                                Next: Enter Details
                            </Button>
                        )}

                        {/* Confirm Button (Step 1) */}
                        {activeStep === 1 && (
                            <Button
                                onClick={handleSubmit}
                                variant="contained"
                                disabled={loading}
                                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <AssignmentReturnIcon />}
                                sx={{
                                    px: 4,
                                }}
                            >
                                {loading ? 'Submitting...' : (user?.is_superuser ? 'Confirm Return' : 'Request Return')}
                            </Button>
                        )}
                    </Box>
                </Box>

            </Paper>

            {/* Notifications */}
            {message && (
                <Snackbar open={true} autoHideDuration={6000} onClose={() => setMessage(null)}>
                    <Alert onClose={() => setMessage(null)} severity={message.type} variant="filled" sx={{ width: '100%' }}>
                        {message.text}
                    </Alert>
                </Snackbar>
            )}
        </Container>
    );
}

export default ReturnAsset;