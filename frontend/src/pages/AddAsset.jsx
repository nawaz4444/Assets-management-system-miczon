import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Container, Paper, TextField, Button, Typography, Box,
    MenuItem, FormControl, InputLabel, Select, Alert,
    Snackbar, Grid, InputAdornment, Divider
} from '@mui/material';

// Importing Icons
import SaveIcon from '@mui/icons-material/Save';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';
import BadgeIcon from '@mui/icons-material/Badge';
import ComputerIcon from '@mui/icons-material/Computer';
import CategoryIcon from '@mui/icons-material/Category';
import BusinessIcon from '@mui/icons-material/Business';
import InfoIcon from '@mui/icons-material/Info';
import MemoryIcon from '@mui/icons-material/Memory';
import NotesIcon from '@mui/icons-material/Notes';

function AddAsset({ token }) {
    const [formData, setFormData] = useState({
        miczon_id: '',
        name: '',
        category: '',
        specifications: '',
        department: '',
        current_status: 'AVAILABLE',
        remarks: ''
    });

    const [departments, setDepartments] = useState([]);
    const [loading, setLoading] = useState(false);
    const [alert, setAlert] = useState({ open: false, message: '', severity: 'success' });

    const authConfig = {
        headers: { Authorization: `Token ${token}` }
    };

    useEffect(() => {
        fetchDepartments();
    }, []);

    const fetchDepartments = () => {
        axios.get('http://127.0.0.1:8000/api/departments/', authConfig)
            .then(res => setDepartments(res.data))
            .catch(err => console.error("Error fetching departments", err));
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleClear = () => {
        setFormData({
            miczon_id: '',
            name: '',
            category: '',
            specifications: '',
            department: '',
            current_status: 'AVAILABLE',
            remarks: ''
        });
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setLoading(true);

        if (!formData.miczon_id || !formData.name) {
            setAlert({ open: true, message: 'Miczon ID and Device Name are required!', severity: 'error' });
            setLoading(false);
            return;
        }

        axios.post('http://127.0.0.1:8000/api/assets/', formData, authConfig)
            .then(res => {
                setAlert({ open: true, message: 'Asset added successfully!', severity: 'success' });
                handleClear();
            })
            .catch(err => {
                const errorMsg = err.response?.data?.miczon_id
                    ? `Error: ${err.response.data.miczon_id}`
                    : 'Failed to add asset. Please check the inputs.';
                setAlert({ open: true, message: errorMsg, severity: 'error' });
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
                        Add New Asset
                    </Typography>
                    <Typography variant="body1" color="textSecondary">
                        Fill in the details below to register a new device in the system.
                    </Typography>
                </Box>

                <Box component="form" onSubmit={handleSubmit} noValidate>
                    {/* --- FORM GRID STARTS --- */}
                    <Grid container spacing={4}>

                        {/* Row 1: ID and Name */}
                        <Grid item xs={12} md={6}>
                            <TextField
                                required
                                fullWidth
                                label="Miczon ID"
                                name="miczon_id"
                                value={formData.miczon_id}
                                onChange={handleChange}
                                placeholder="e.g., MIC-001"
                                variant="outlined"
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <BadgeIcon color="primary" />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                required
                                fullWidth
                                label="Device Name"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                placeholder="e.g., Dell Latitude"
                                variant="outlined"
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <ComputerIcon color="primary" />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Grid>

                        {/* Row 2: Category, Department, Status */}
                        <Grid item xs={12} md={4}>
                            <TextField
                                fullWidth
                                label="Category"
                                name="category"
                                value={formData.category}
                                onChange={handleChange}
                                placeholder="e.g., Laptop"
                                variant="outlined"
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <CategoryIcon color="action" />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <FormControl fullWidth variant="outlined">
                                <InputLabel id="department-label" shrink>Department</InputLabel>
                                <Select
                                    labelId="department-label"
                                    name="department"
                                    value={formData.department}
                                    onChange={handleChange}
                                    label="Department"
                                    displayEmpty
                                    startAdornment={
                                        <InputAdornment position="start" sx={{ pl: 1 }}>
                                            <BusinessIcon color="action" />
                                        </InputAdornment>
                                    }
                                >
                                    <MenuItem value="" disabled>
                                        <Typography color="textSecondary">Select Department</Typography>
                                    </MenuItem>
                                    {departments.map(dept => (
                                        <MenuItem key={dept.id} value={dept.id}>
                                            {dept.name}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>

                        <Grid item xs={12} md={4}>
                            <FormControl fullWidth variant="outlined">
                                <InputLabel id="status-label" shrink>Status</InputLabel>
                                <Select
                                    labelId="status-label"
                                    name="current_status"
                                    value={formData.current_status}
                                    onChange={handleChange}
                                    label="Status"
                                    startAdornment={
                                        <InputAdornment position="start" sx={{ pl: 1 }}>
                                            <InfoIcon color={
                                                formData.current_status === 'AVAILABLE' ? 'success' :
                                                    formData.current_status === 'BROKEN' ? 'error' : 'warning'
                                            } />
                                        </InputAdornment>
                                    }
                                >
                                    <MenuItem value="AVAILABLE">Available</MenuItem>
                                    <MenuItem value="ASSIGNED">Assigned</MenuItem>
                                    <MenuItem value="BROKEN">Broken/Repair</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>

                        {/* Row 3: Specifications */}
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Specifications"
                                name="specifications"
                                value={formData.specifications}
                                onChange={handleChange}
                                placeholder="Processor, RAM..."
                                variant="outlined"
                                InputProps={{
                                    startAdornment: (
                                        <InputAdornment position="start">
                                            <MemoryIcon color="action" />
                                        </InputAdornment>
                                    ),
                                }}
                            />
                        </Grid>

                        {/* Row 4: Remarks */}
                        <Grid item xs={12} md={6}>
                            <TextField
                                fullWidth
                                label="Remarks"
                                name="remarks"
                                value={formData.remarks}
                                onChange={handleChange}
                                placeholder="Additional notes..."
                                variant="outlined"
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
                    {/* --- FORM GRID ENDS --- */}

                    {/* --- ACTION BUTTONS (Outside Grid) --- */}
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
                                startIcon={<SaveIcon />}
                                disabled={loading}
                                sx={{
                                    px: 6,
                                }}
                            >
                                {loading ? 'Saving...' : 'Save Asset'}
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

export default AddAsset;