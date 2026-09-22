import React, { useState } from 'react';
import axios from 'axios';
import { Container, Paper, TextField, Button, Typography, Box, Alert } from '@mui/material';

import { BACKEND_BASE } from './utils/config';
import { Link } from 'react-router-dom';
import { safeNextPath } from './utils/navigation';

function Login({ setToken }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [busy, setBusy] = useState(false);

    const params = new URLSearchParams(window.location.search);
    const googleError = params.get('error');
    const googleErrorMessage = (() => {
        if (!googleError) return '';
        if (googleError === 'invalid_domain') return 'Please sign in using your miczon.com Google account.';
        if (googleError === 'missing_email') return 'Google did not provide an email for this account. Please use your miczon.com account.';
        if (googleError === 'unverified_email') return 'Your Google email is not verified. Please verify it and try again.';
        return 'Google login failed. Please try again.';
    })();

    const handleSubmit = (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError('');
        axios.post(`${BACKEND_BASE}/api-token-auth/`, {
            username: username,
            password: password
        })
            .then(response => {
                const token = response.data.token;
                localStorage.setItem('userToken', token);
                setToken(token);
            })
            .catch(err => {
                console.error(err);
                setError(err.response?.status === 400 ? 'Invalid username or password.' : 'Unable to reach the login service. Please try again.');
            }).finally(() => setBusy(false));
    };

    return (
        <Container component="main" maxWidth="xs" style={{ marginTop: '100px' }}>
            <Paper elevation={3} style={{ padding: '30px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Typography component="h1" variant="h5">Inventory Login</Typography>
                {error && <Alert severity="error" style={{ width: '100%', marginTop: '10px' }}>{error}</Alert>}
                {googleErrorMessage && <Alert severity="error" style={{ width: '100%', marginTop: '10px' }}>{googleErrorMessage}</Alert>}

                <Button
                    fullWidth
                    variant="outlined"
                    style={{ marginTop: '16px' }}
                    onClick={() => { sessionStorage.setItem('auth:next', safeNextPath(params.get('next'))); window.location.href = `${BACKEND_BASE}/accounts/google/login/`; }}
                >
                    Continue with Google
                </Button>

                <Box component="form" onSubmit={handleSubmit} style={{ marginTop: '20px', width: '100%' }}>
                    <TextField variant="outlined" margin="normal" required fullWidth label="Username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
                    <TextField variant="outlined" margin="normal" required fullWidth label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    <Button type="submit" disabled={busy} fullWidth variant="contained" color="primary" style={{ margin: '20px 0' }}>{busy ? 'Signing in…' : 'Sign In'}</Button>
                    <Link to="/forgot-password">Forgot password?</Link>
                </Box>
            </Paper>
        </Container>
    );
}
export default Login;
