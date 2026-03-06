import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Table, TableBody, TableCell, TableContainer, TableHead,
    TableRow, Paper, Typography, Box, Chip, Dialog, DialogTitle,
    DialogContent, DialogActions, Button, TextField, MenuItem,
    CircularProgress, Alert
} from '@mui/material';
import { Build, Warning, CheckCircle } from '@mui/icons-material';
import { fetchAllPages } from './utils/apiHelpers';

const RepairWatchlist = ({ token, onAssetReturned }) => {
    const [repairAssets, setRepairAssets] = useState([]);
    const [openReturnDialog, setOpenReturnDialog] = useState(false);
    const [selectedAsset, setSelectedAsset] = useState(null);
    const [returnForm, setReturnForm] = useState({
        condition: 'Good',
        remarks: '',
        returned_by: 'Admin'
    });
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState(null);
    const authConfig = { headers: { Authorization: `Token ${token}` } };
    const API_BASE = 'http://localhost:8000/api';

    const fetchRepairs = async () => {
        try {
            const allRepairs = await fetchAllPages(`${API_BASE}/assets/`, authConfig, { status: 'BROKEN' });
            setRepairAssets(allRepairs);
        } catch (err) {
            console.error("Error fetching repairs", err);
        }
    };

    useEffect(() => {
        if (token) {
            fetchRepairs();
        }
    }, [token]);

    const calculateDays = (dateStr) => {
        if (!dateStr) return 'N/A';
        const start = new Date(dateStr);
        const today = new Date();
        const diff = Math.floor((today - start) / (1000 * 60 * 60 * 24));
        return diff;
    };

    const handleRowClick = (asset) => {
        setSelectedAsset(asset);
        setReturnForm({
            condition: 'Good',
            remarks: '',
            returned_by: 'Admin'
        });
        setMessage(null);
        setOpenReturnDialog(true);
    };

    const handleReturnFromRepair = async () => {
        if (!selectedAsset) return;

        setLoading(true);
        setMessage(null);

        try {
            await axios.post(
                `${API_BASE}/assets/${selectedAsset.id}/return_from_repair/`,
                returnForm,
                authConfig
            );

            setMessage({ type: 'success', text: 'Asset returned to inventory successfully!' });

            // Refresh the repair list
            setTimeout(async () => {
                await fetchRepairs();
                setOpenReturnDialog(false);
                setSelectedAsset(null);
                if (onAssetReturned) {
                    onAssetReturned();
                }
            }, 1500);

        } catch (err) {
            console.error("Error returning from repair", err);
            setMessage({
                type: 'error',
                text: err.response?.data?.error || 'Failed to return asset from repair'
            });
        } finally {
            setLoading(false);
        }
    };

    const handleCloseDialog = () => {
        if (!loading) {
            setOpenReturnDialog(false);
            setSelectedAsset(null);
            setMessage(null);
        }
    };

    return (
        <Paper elevation={3} sx={{ p: 3, borderRadius: 3, mt: 4 }}>
            <Box display="flex" alignItems="center" mb={2} gap={1}>
                <Build color="error" />
                <Typography variant="h6" fontWeight="bold">Repair Watchlist</Typography>
            </Box>
            <TableContainer sx={{ maxHeight: 400 }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 'bold' }}>Asset Name</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Vendor</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Days in Repair</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Status</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {repairAssets.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={4} align="center" sx={{ py: 4 }}>
                                    <Typography variant="body2" color="textSecondary">No assets currently in repair.</Typography>
                                </TableCell>
                            </TableRow>
                        ) : (
                            repairAssets.map((asset) => (
                                <TableRow
                                    key={asset.id}
                                    onClick={() => handleRowClick(asset)}
                                    sx={{
                                        bgcolor: asset.is_overdue_repair ? '#ffebee' : 'inherit',
                                        '&:hover': {
                                            bgcolor: asset.is_overdue_repair ? '#ffcdd2' : '#f5f5f5',
                                            cursor: 'pointer'
                                        }
                                    }}
                                >
                                    <TableCell>
                                        <Typography variant="body2" fontWeight="bold" color="primary">{asset.miczon_id}</Typography>
                                        <Typography variant="body2">{asset.name}</Typography>
                                    </TableCell>
                                    <TableCell>{asset.maintenance_vendor || 'Not Specified'}</TableCell>
                                    <TableCell>{calculateDays(asset.sent_to_repair_date)} days</TableCell>
                                    <TableCell>
                                        {asset.is_overdue_repair ? (
                                            <Chip
                                                icon={<Warning sx={{ fontSize: '1rem !important' }} />}
                                                label="OVERDUE"
                                                size="small"
                                                sx={{ bgcolor: '#d32f2f', color: 'white', fontWeight: 'bold' }}
                                            />
                                        ) : (
                                            <Chip label="In Repair" size="small" variant="outlined" color="error" />
                                        )}
                                    </TableCell>
                                </TableRow>
                            ))
                        )}
                    </TableBody>
                </Table>
            </TableContainer>

            {/* Return from Repair Dialog */}
            <Dialog
                open={openReturnDialog}
                onClose={handleCloseDialog}
                maxWidth="sm"
                fullWidth
            >
                <DialogTitle>
                    <Box display="flex" alignItems="center" gap={1}>
                        <CheckCircle color="success" />
                        <Typography variant="h6">Return Asset from Repair</Typography>
                    </Box>
                </DialogTitle>
                <DialogContent>
                    {selectedAsset && (
                        <Box sx={{ mb: 2 }}>
                            <Typography variant="body2" color="textSecondary" gutterBottom>
                                Asset Details:
                            </Typography>
                            <Typography variant="body1" fontWeight="bold" color="primary">
                                {selectedAsset.miczon_id} - {selectedAsset.name}
                            </Typography>
                            {selectedAsset.maintenance_vendor && (
                                <Typography variant="body2" color="textSecondary">
                                    Vendor: {selectedAsset.maintenance_vendor}
                                </Typography>
                            )}
                        </Box>
                    )}

                    {message && (
                        <Alert severity={message.type} sx={{ mb: 2 }}>
                            {message.text}
                        </Alert>
                    )}

                    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, mt: 2 }}>
                        <TextField
                            select
                            label="Condition"
                            fullWidth
                            value={returnForm.condition}
                            onChange={(e) => setReturnForm({ ...returnForm, condition: e.target.value })}
                            SelectProps={{ native: false }}
                        >
                            <MenuItem value="Good">Good</MenuItem>
                            <MenuItem value="Repaired">Repaired</MenuItem>
                            <MenuItem value="Like New">Like New</MenuItem>
                            <MenuItem value="Minor Issues">Minor Issues</MenuItem>
                        </TextField>

                        <TextField
                            label="Returned By"
                            fullWidth
                            value={returnForm.returned_by}
                            onChange={(e) => setReturnForm({ ...returnForm, returned_by: e.target.value })}
                        />

                        <TextField
                            label="Remarks"
                            fullWidth
                            multiline
                            rows={3}
                            value={returnForm.remarks}
                            onChange={(e) => setReturnForm({ ...returnForm, remarks: e.target.value })}
                            placeholder="Additional notes about the repair..."
                        />
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={handleCloseDialog} disabled={loading}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleReturnFromRepair}
                        variant="contained"
                        color="success"
                        disabled={loading}
                        startIcon={loading ? <CircularProgress size={20} /> : <CheckCircle />}
                    >
                        {loading ? 'Processing...' : 'Return to Inventory'}
                    </Button>
                </DialogActions>
            </Dialog>
        </Paper>
    );
};

export default RepairWatchlist;
