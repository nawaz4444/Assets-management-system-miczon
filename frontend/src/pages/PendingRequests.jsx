import React, { useState, useEffect, useContext } from 'react';
import axios from 'axios';
import {
    Container, Paper, Typography, Box, Table, TableBody, TableCell,
    TableContainer, TableHead, TableRow, Button, Chip, Tabs, Tab,
    Dialog, DialogTitle, DialogContent, DialogActions, TextField,
    CircularProgress, Alert, Avatar, Stack
} from '@mui/material';
import {
    Rule as RuleIcon,
    CheckCircle as CheckCircleIcon,
    Cancel as CancelIcon,
    AccessTime as AccessTimeIcon,
    Person as PersonIcon,
    Inventory as InventoryIcon
} from '@mui/icons-material';
import { UserContext } from '../App';

export default function PendingRequests({ token }) {
    const { user } = useContext(UserContext);
    const [requests, setRequests] = useState([]);
    const [loading, setLoading] = useState(true);
    const [tabValue, setTabValue] = useState(0); // 0: Pending, 1: Approved, 2: Rejected

    // Dialog state
    const [openDialog, setOpenDialog] = useState(false);
    const [selectedReq, setSelectedReq] = useState(null);
    const [adminRemarks, setAdminRemarks] = useState('');
    const [processing, setProcessing] = useState(false);

    const authConfig = { headers: { Authorization: `Token ${token}` } };
    const API_BASE = 'http://localhost:8000/api';

    const fetchRequests = async () => {
        setLoading(true);
        try {
            const statusMap = ['PENDING', 'APPROVED', 'REJECTED'];
            const res = await axios.get(`${API_BASE}/requests/?status=${statusMap[tabValue]}`, authConfig);
            setRequests(res.data);
        } catch (err) {
            console.error("Fetch requests error:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (token) fetchRequests();
    }, [token, tabValue]);

    const handleAction = async (action) => {
        if (!selectedReq) return;
        setProcessing(true);
        try {
            await axios.post(`${API_BASE}/requests/${selectedReq.id}/${action}/`, {
                admin_remarks: adminRemarks
            }, authConfig);
            setOpenDialog(false);
            setSelectedReq(null);
            setAdminRemarks('');
            fetchRequests();
        } catch (err) {
            console.error(`${action} error:`, err);
            alert(`Failed to ${action} request.`);
        } finally {
            setProcessing(false);
        }
    };

    const getActionColor = (type) => {
        switch (type) {
            case 'ASSIGN': return 'success';
            case 'TRANSFER': return 'info';
            case 'RETURN': return 'warning';
            case 'REPAIR': return 'error';
            default: return 'default';
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'PENDING': return 'warning';
            case 'APPROVED': return 'success';
            case 'REJECTED': return 'error';
            default: return 'default';
        }
    };

    return (
        <Container maxWidth="xl" sx={{ mt: 6, pb: 8 }}>
            <Paper
                elevation={6}
                sx={{
                    p: 4,
                    borderRadius: 3,
                    borderTop: '6px solid #10b981', // Emerald top bar
                    transition: 'transform 0.3s, box-shadow 0.3s',
                    '&:hover': {
                        transform: 'translateY(-4px)',
                        boxShadow: 10
                    }
                }}
            >
                {/* Header */}
                <Box mb={4} display="flex" alignItems="center" gap={2}>
                    <RuleIcon color="success" sx={{ fontSize: 40 }} />
                    <Box>
                        <Typography variant="h4" fontWeight="800" sx={{ letterSpacing: '-0.5px', color: '#000000' }}>
                            Action Approvals
                        </Typography>
                        <Typography variant="body1" color="textSecondary">
                            Review and approve pending asset transfers, returns, and repair requests.
                        </Typography>
                    </Box>
                </Box>

                <Tabs
                    value={tabValue}
                    onChange={(e, v) => setTabValue(v)}
                    sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}
                >
                    <Tab label="Pending" icon={<AccessTimeIcon />} iconPosition="start" />
                    <Tab label="Approved" icon={<CheckCircleIcon />} iconPosition="start" />
                    <Tab label="Rejected" icon={<CancelIcon />} iconPosition="start" />
                </Tabs>

                {loading ? (
                    <Box display="flex" justifyContent="center" py={10}>
                        <CircularProgress />
                    </Box>
                ) : requests.length === 0 ? (
                    <Box p={8} textAlign="center">
                        <Typography variant="h6" color="textSecondary">No requests found in this category.</Typography>
                    </Box>
                ) : (
                    <TableContainer>
                        <Table sx={{ minWidth: 650 }}>
                            <TableHead sx={{ bgcolor: '#f8fafc' }}>
                                <TableRow>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Request Info</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Asset</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Action</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Details</TableCell>
                                    <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                                    {user?.is_superuser && tabValue === 0 && (
                                        <TableCell align="right" sx={{ fontWeight: 'bold' }}>Actions</TableCell>
                                    )}
                                </TableRow>
                            </TableHead>
                            <TableBody>
                                {requests.map((req) => (
                                    <TableRow key={req.id} hover>
                                        <TableCell>
                                            <Stack direction="row" spacing={1} alignItems="center">
                                                <Avatar sx={{ width: 32, height: 32, bgcolor: 'primary.light' }}>
                                                    <PersonIcon fontSize="small" />
                                                </Avatar>
                                                <Box>
                                                    <Typography variant="body2" fontWeight="bold">{req.requester_name}</Typography>
                                                    <Typography variant="caption" color="textSecondary">
                                                        {new Date(req.created_at).toLocaleDateString()}
                                                    </Typography>
                                                </Box>
                                            </Stack>
                                        </TableCell>
                                        <TableCell>
                                            <Box>
                                                <Typography variant="body2" fontWeight="bold">{req.asset_miczon_id}</Typography>
                                                <Typography variant="caption">{req.asset_name}</Typography>
                                            </Box>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={req.action_type}
                                                size="small"
                                                color={getActionColor(req.action_type)}
                                                sx={{ fontWeight: 'bold' }}
                                            />
                                        </TableCell>
                                        <TableCell>
                                            <Typography variant="body2" sx={{ maxWidth: 200 }} noWrap title={req.remarks}>
                                                {req.action_type === 'TRANSFER' && `To: ${req.target_employee_name}`}
                                                {req.action_type === 'REPAIR' && `Vendor: ${req.vendor}`}
                                                {req.remarks && ` (${req.remarks})`}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                label={req.status}
                                                size="small"
                                                variant="outlined"
                                                color={getStatusColor(req.status)}
                                            />
                                            {req.admin_remarks && (
                                                <Typography variant="caption" display="block" color="textSecondary" sx={{ mt: 0.5 }}>
                                                    Note: {req.admin_remarks}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        {user?.is_superuser && tabValue === 0 && (
                                            <TableCell align="right">
                                                <Button
                                                    variant="contained"
                                                    color="primary"
                                                    size="small"
                                                    onClick={() => {
                                                        setSelectedReq(req);
                                                        setOpenDialog(true);
                                                    }}
                                                    sx={{ borderRadius: 2, textTransform: 'none' }}
                                                >
                                                    Review
                                                </Button>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </TableContainer>
                )}
            </Paper>

            {/* Approval Dialog */}
            <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
                <DialogTitle sx={{ fontWeight: 'bold' }}>
                    Process {selectedReq?.action_type} Request
                </DialogTitle>
                <DialogContent dividers>
                    <Box display="flex" flexDirection="column" gap={2} py={1}>
                        <Alert severity="info" variant="outlined">
                            <Typography variant="body2">
                                <strong>Requester:</strong> {selectedReq?.requester_name}<br />
                                <strong>Asset:</strong> {selectedReq?.asset_miczon_id} - {selectedReq?.asset_name}<br />
                                <strong>Action:</strong> {selectedReq?.action_type}<br />
                                {selectedReq?.target_employee_name && <><strong>Target:</strong> {selectedReq?.target_employee_name}<br /></>}
                                {selectedReq?.vendor && <><strong>Vendor:</strong> {selectedReq?.vendor}<br /></>}
                                <strong>Remarks:</strong> {selectedReq?.remarks || 'None'}
                            </Typography>
                        </Alert>
                        <TextField
                            label="Admin Remarks"
                            multiline
                            rows={3}
                            fullWidth
                            value={adminRemarks}
                            onChange={(e) => setAdminRemarks(e.target.value)}
                            placeholder="Add notes for the requester..."
                        />
                    </Box>
                </DialogContent>
                <DialogActions sx={{ p: 2, gap: 1 }}>
                    <Button
                        onClick={() => handleAction('reject')}
                        color="error"
                        disabled={processing}
                        startIcon={<CancelIcon />}
                        sx={{ textTransform: 'none', fontWeight: 'bold' }}
                    >
                        Reject
                    </Button>
                    <Button
                        onClick={() => handleAction('approve')}
                        variant="contained"
                        color="success"
                        disabled={processing}
                        startIcon={<CheckCircleIcon />}
                        sx={{ textTransform: 'none', fontWeight: 'bold' }}
                    >
                        Approve & Execute
                    </Button>
                </DialogActions>
            </Dialog>
        </Container>
    );
}
