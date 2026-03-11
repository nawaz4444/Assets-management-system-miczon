import React, { useState, useEffect } from 'react';
import axios from 'axios';
import {
    Container, Paper, TextField, Button, Typography, Box, Alert,
    CircularProgress, InputAdornment, IconButton
} from '@mui/material';
import { useNavigate, useParams } from 'react-router-dom';
import LockResetIcon from '@mui/icons-material/LockReset';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';

import { API_BASE } from './utils/config';

function ResetPassword() {
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [validating, setValidating] = useState(true);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [tokenValid, setTokenValid] = useState(false);
    const [username, setUsername] = useState('');
    const [resetSuccess, setResetSuccess] = useState(false);

    const { uid, token } = useParams();
    const navigate = useNavigate();

    // Validate token on component mount
    useEffect(() => {
        const validateToken = async () => {
            try {
                const response = await axios.post(`${API_BASE}/password-reset/validate/`, {
                    uid: uid,
                    token: token
                });

                if (response.data.status === 'success') {
                    setTokenValid(true);
                    setUsername(response.data.username);
                } else {
                    setError('This password reset link is invalid or has expired.');
                    setTokenValid(false);
                }
            } catch (err) {
                console.error(err);
                setError('This password reset link is invalid or has expired.');
                setTokenValid(false);
            } finally {
                setValidating(false);
            }
        };

        validateToken();
    }, [uid, token]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');

        // Validation
        if (newPassword.length < 8) {
            setError('Password must be at least 8 characters long');
            return;
        }

        if (newPassword !== confirmPassword) {
            setError('Passwords do not match');
            return;
        }

        setLoading(true);

        try {
            const response = await axios.post(`${API_BASE}/password-reset/confirm/`, {
                uid: uid,
                token: token,
                new_password: newPassword
            });

            if (response.data.status === 'success') {
                setResetSuccess(true);
                setMessage(response.data.message);

                // Redirect to login after 3 seconds
                setTimeout(() => {
                    navigate('/login');
                }, 3000);
            } else {
                setError(response.data.message || 'Failed to reset password');
            }
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    if (validating) {
        return (
            <Container component="main" maxWidth="xs" style={{ marginTop: '100px' }}>
                <Paper
                    elevation={3}
                    style={{
                        padding: '40px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        borderRadius: '12px'
                    }}
                >
                    <CircularProgress size={60} />
                    <Typography variant="h6" style={{ marginTop: '20px' }}>
                        Validating reset link...
                    </Typography>
                </Paper>
            </Container>
        );
    }

    if (!tokenValid) {
        return (
            <Container component="main" maxWidth="xs" style={{ marginTop: '100px' }}>
                <Paper
                    elevation={3}
                    style={{
                        padding: '40px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        borderRadius: '12px'
                    }}
                >
                    <Alert severity="error" style={{ width: '100%', marginBottom: '20px' }}>
                        {error}
                    </Alert>
                    <Button
                        variant="contained"
                        color="primary"
                        onClick={() => navigate('/forgot-password')}
                        style={{ textTransform: 'none' }}
                    >
                        Request New Reset Link
                    </Button>
                </Paper>
            </Container>
        );
    }

    if (resetSuccess) {
        return (
            <Container component="main" maxWidth="xs" style={{ marginTop: '100px' }}>
                <Paper
                    elevation={3}
                    style={{
                        padding: '40px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        borderRadius: '12px'
                    }}
                >
                    <Box
                        style={{
                            backgroundColor: '#4caf50',
                            borderRadius: '50%',
                            padding: '15px',
                            marginBottom: '20px'
                        }}
                    >
                        <CheckCircleIcon style={{ fontSize: 60, color: 'white' }} />
                    </Box>
                    <Typography variant="h5" style={{ marginBottom: '10px', fontWeight: 600 }}>
                        Password Reset Successful!
                    </Typography>
                    <Alert severity="success" style={{ width: '100%', marginTop: '15px' }}>
                        {message}
                    </Alert>
                    <Typography variant="body2" color="textSecondary" style={{ marginTop: '15px' }}>
                        Redirecting to login page...
                    </Typography>
                </Paper>
            </Container>
        );
    }

    return (
        <Container component="main" maxWidth="xs" style={{ marginTop: '100px' }}>
            <Paper
                elevation={3}
                style={{
                    padding: '40px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    borderRadius: '12px'
                }}
            >
                <Box
                    style={{
                        backgroundColor: '#1976d2',
                        borderRadius: '50%',
                        padding: '15px',
                        marginBottom: '20px'
                    }}
                >
                    <LockResetIcon style={{ fontSize: 40, color: 'white' }} />
                </Box>

                <Typography component="h1" variant="h5" style={{ marginBottom: '10px', fontWeight: 600 }}>
                    Reset Password
                </Typography>

                <Typography variant="body2" color="textSecondary" align="center" style={{ marginBottom: '20px' }}>
                    Hi <strong>{username}</strong>, enter your new password below.
                </Typography>

                {error && (
                    <Alert severity="error" style={{ width: '100%', marginBottom: '15px' }}>
                        {error}
                    </Alert>
                )}

                <Box component="form" onSubmit={handleSubmit} style={{ width: '100%' }}>
                    <TextField
                        variant="outlined"
                        margin="normal"
                        required
                        fullWidth
                        label="New Password"
                        type={showPassword ? 'text' : 'password'}
                        autoFocus
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        disabled={loading}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                        onClick={() => setShowPassword(!showPassword)}
                                        edge="end"
                                    >
                                        {showPassword ? <VisibilityOff /> : <Visibility />}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                        helperText="Must be at least 8 characters"
                    />

                    <TextField
                        variant="outlined"
                        margin="normal"
                        required
                        fullWidth
                        label="Confirm New Password"
                        type={showConfirmPassword ? 'text' : 'password'}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        disabled={loading}
                        InputProps={{
                            endAdornment: (
                                <InputAdornment position="end">
                                    <IconButton
                                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                        edge="end"
                                    >
                                        {showConfirmPassword ? <VisibilityOff /> : <Visibility />}
                                    </IconButton>
                                </InputAdornment>
                            ),
                        }}
                    />

                    <Button
                        type="submit"
                        fullWidth
                        variant="contained"
                        color="primary"
                        style={{
                            margin: '20px 0',
                            padding: '12px',
                            textTransform: 'none',
                            fontSize: '16px',
                            fontWeight: 600
                        }}
                        disabled={loading}
                    >
                        {loading ? <CircularProgress size={24} color="inherit" /> : 'Reset Password'}
                    </Button>
                </Box>
            </Paper>
        </Container>
    );
}

export default ResetPassword;
