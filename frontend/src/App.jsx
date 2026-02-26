import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import { AppBar, Toolbar, Typography, Button, Box, Tabs, Tab, ThemeProvider, CssBaseline } from '@mui/material';
import LogoutIcon from '@mui/icons-material/Logout';
import DashboardIcon from '@mui/icons-material/Dashboard';
import AssignmentIcon from '@mui/icons-material/Assignment';
import AssignmentReturnIcon from '@mui/icons-material/AssignmentReturn';
import AddBoxIcon from '@mui/icons-material/AddBox';
import AssessmentIcon from '@mui/icons-material/Assessment';
import logoMic from './logo.mic.png';
import theme from './theme';

import Login from './Login';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import Dashboard from './pages/Dashboard';
import ReportsDashboard from './pages/ReportsDashboard';
import AddAsset from './pages/AddAsset';
import AssignAsset from './pages/AssignAsset';

import ReturnAsset from './pages/ReturnAsset';
import AddAssetLog from './pages/AddAssetLog';
import InspectionReport from './pages/InspectionReport';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';

function App() {
  const getInitialToken = () => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      localStorage.setItem('userToken', urlToken);
      // Clean URL immediately
      window.history.replaceState({}, document.title, window.location.pathname);
      return urlToken;
    }
    return localStorage.getItem('userToken');
  };

  const [token, setToken] = useState(getInitialToken);
  const [currentTab, setCurrentTab] = useState(0);



  const handleLogout = () => {
    localStorage.removeItem('userToken');
    setToken(null);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        {!token ? (
          <Routes>
            <Route path="/login" element={<Login setToken={setToken} />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        ) : (
          <div style={{ minHeight: '100vh' }}>
            <AppBar position="static">
              <Toolbar>
                <Box
                  component={Link}
                  to="/"
                  onClick={() => window.location.href = '/'}
                  sx={{
                    flexGrow: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 2,
                    textDecoration: 'none',
                    color: 'inherit'
                  }}
                >
                  <Box
                    component="img"
                    src={logoMic}
                    alt="Miczon Logo"
                    sx={{
                      width: 40,
                      height: 40,
                      objectFit: 'contain'
                    }}
                  />
                  <Typography
                    variant="h6"
                    sx={{
                      fontWeight: 'bold',
                      letterSpacing: '0.5px',
                      fontSize: '1.1rem'
                    }}
                  >
                    ASSET MANAGEMENT SYSTEM
                  </Typography>
                </Box>

                <Box sx={{ mr: 3 }}>
                  <Tabs
                    value={currentTab}
                    onChange={(e, newValue) => setCurrentTab(newValue)}
                    textColor="inherit"
                    indicatorColor="primary"
                  >
                    <Tab
                      label="Dashboard"
                      icon={<DashboardIcon />}
                      iconPosition="start"
                      component={Link}
                      to="/"
                    />
                    <Tab
                      label="Reports"
                      icon={<AssessmentIcon />}
                      iconPosition="start"
                      component={Link}
                      to="/reports"
                    />
                    <Tab
                      label="Add Asset"
                      icon={<AddBoxIcon />}
                      iconPosition="start"
                      component={Link}
                      to="/add-asset"
                    />
                    <Tab
                      label="Assign Asset"
                      icon={<AssignmentIcon />}
                      iconPosition="start"
                      component={Link}
                      to="/assign"
                    />
                    <Tab
                      label="Return Asset"
                      icon={<AssignmentReturnIcon />}
                      iconPosition="start"
                      component={Link}
                      to="/return"
                    />
                    <Tab
                      label="Inspection"
                      icon={<AssignmentTurnedInIcon />}
                      iconPosition="start"
                      component={Link}
                      to="/inspection"
                    />
                  </Tabs>
                </Box>

                <Button
                  variant="outlined"
                  onClick={handleLogout}
                  startIcon={<LogoutIcon />}
                  sx={{
                    borderColor: '#1E293B',
                    color: '#1E293B',
                    '&:hover': {
                      borderColor: '#F05A28',
                      color: '#F05A28',
                      backgroundColor: 'rgba(240, 90, 40, 0.04)'
                    }
                  }}
                >
                  Logout
                </Button>
              </Toolbar>
            </AppBar>

            <Routes>
              <Route path="/" element={<Dashboard token={token} handleLogout={handleLogout} />} />
              <Route path="/reports" element={<ReportsDashboard token={token} />} />
              <Route path="/add-asset" element={<AddAsset token={token} />} />
              <Route path="/assign" element={<AssignAsset token={token} />} />
              <Route path="/return" element={<ReturnAsset token={token} />} />
              <Route path="/inspection" element={<AddAssetLog token={token} />} />
              <Route path="/inspection-report" element={<InspectionReport token={token} />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        )}
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;