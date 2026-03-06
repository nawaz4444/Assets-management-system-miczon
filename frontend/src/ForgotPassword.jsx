import React, { useState } from 'react';
import axios from 'axios';
import {
    Container, Paper, TextField, Button, Typography, Box, Alert,
    CircularProgress, Link
} from '@mui/material';
import { useNavigate } from 'react-router-dom';
import EmailIcon from '@mui/icons-material/Email';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

function ForgotPassword() {
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setMessage('');

        try {
            const response = await axios.post('http://localhost:8000/api/password-reset/request/', {
                email: email
            });

            if (response.data.status === 'success') {
                setMessage(response.data.message);
                setEmail(''); // Clear the form
            } else {
                setError(response.data.message || 'Failed to send reset email');
            }
        } catch (err) {
            console.error(err);
            setError(err.response?.data?.message || 'An error occurred. Please try again.');
        } finally {
            setLoading(false);
        }
    };

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
                    <EmailIcon style={{ fontSize: 40, color: 'white' }} />
                </Box>

                <Typography component="h1" variant="h5" style={{ marginBottom: '10px', fontWeight: 600 }}>
                    Forgot Password?
                </Typography>

                <Typography variant="body2" color="textSecondary" align="center" style={{ marginBottom: '20px' }}>
                    Enter your email address and we'll send you a link to reset your password.
                </Typography>

                {message && (
                    <Alert severity="success" style={{ width: '100%', marginBottom: '15px' }}>
                        {message}
                    </Alert>
                )}

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
                        label="Email Address"
                        type="email"
                        autoFocus
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        disabled={loading}
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
                        {loading ? <CircularProgress size={24} color="inherit" /> : 'Send Reset Link'}
                    </Button>

                    <Box style={{ textAlign: 'center', marginTop: '15px' }}>
                        <Link
                            component="button"
                            variant="body2"
                            type="button"
                            onClick={() => navigate('/login')}
                            style={{
                                textDecoration: 'none',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '5px'
                            }}
                        >
                            <ArrowBackIcon fontSize="small" />
                            Back to Login
                        </Link>
                    </Box>
                </Box>
            </Paper>
        </Container>
    );
}

export default ForgotPassword;
