import React, { useState } from 'react';
import axios from 'axios';
import { Container, Paper, TextField, Button, Typography, Box, Alert } from '@mui/material';

function Login({ setToken }) {
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        axios.post('http://127.0.0.1:8000/api-token-auth/', {
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
                setError('Invalid Username or Password');
            });
    };

    return (
        <Container component="main" maxWidth="xs" style={{ marginTop: '100px' }}>
            <Paper elevation={3} style={{ padding: '30px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <Typography component="h1" variant="h5">Inventory Login</Typography>
                {error && <Alert severity="error" style={{ width: '100%', marginTop: '10px' }}>{error}</Alert>}
                <Box component="form" onSubmit={handleSubmit} style={{ marginTop: '20px', width: '100%' }}>
                    <TextField variant="outlined" margin="normal" required fullWidth label="Username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} />
                    <TextField variant="outlined" margin="normal" required fullWidth label="Password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                    <Button type="submit" fullWidth variant="contained" color="primary" style={{ margin: '20px 0' }}>Sign In</Button>
                </Box>
            </Paper>
        </Container>
    );
}
export default Login;