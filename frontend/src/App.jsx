import React, { useState, useEffect, createContext, useContext } from 'react';
import axios from 'axios';
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

export const UserContext = createContext(null);

const API_BASE = 'http://localhost:8000/api';

const PermissionGuard = ({ permission, children }) => {
  const { user } = useContext(UserContext);
  if (!user) return null;
  if (user.is_superuser) return children;
  const hasPermission = user.permissions?.includes(permission);
  return hasPermission ? children : null;
};

const ProtectedPermissionRoute = ({ permission, children }) => {
  const { user, loading } = useContext(UserContext);

  if (loading) return <div>Loading...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.is_superuser) return children;

  const hasPermission = user.permissions?.includes(permission);
  return hasPermission ? children : <Navigate to="/" replace />;
};

function App() {
  const getInitialToken = () => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const urlUserId = params.get('user_id');
    if (urlToken) {
      localStorage.setItem('userToken', urlToken);
      if (urlUserId) localStorage.setItem('userId', urlUserId);
      // Clean URL immediately
      window.history.replaceState({}, document.title, window.location.pathname);
      return urlToken;
    }
    return localStorage.getItem('userToken');
  };

  const [token, setToken] = useState(getInitialToken);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!token);
  const [currentTab, setCurrentTab] = useState(0);

  useEffect(() => {
    if (token) {
      const fetchUser = async () => {
        try {
          const res = await axios.get(`${API_BASE}/auth/current-user/`, {
            headers: { Authorization: `Token ${token}` }
          });
          setUser(res.data);
        } catch (err) {
          console.error('Failed to fetch user:', err);
          handleLogout();
        } finally {
          setLoading(false);
        }
      };
      fetchUser();
    } else {
      setLoading(false);
    }
  }, [token]);



  const handleLogout = () => {
    localStorage.removeItem('userToken');
    setToken(null);
  };

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <UserContext.Provider value={{ user, setUser, loading, token }}>
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
                      <PermissionGuard permission="inventory.view_asset">
                        <Tab
                          label="Reports"
                          icon={<AssessmentIcon />}
                          iconPosition="start"
                          component={Link}
                          to="/reports"
                        />
                      </PermissionGuard>
                      <PermissionGuard permission="inventory.add_asset">
                        <Tab
                          label="Add Asset"
                          icon={<AddBoxIcon />}
                          iconPosition="start"
                          component={Link}
                          to="/add-asset"
                        />
                      </PermissionGuard>
                      <PermissionGuard permission="inventory.add_assetassignment">
                        <Tab
                          label="Assign Asset"
                          icon={<AssignmentIcon />}
                          iconPosition="start"
                          component={Link}
                          to="/assign"
                        />
                      </PermissionGuard>
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
                <Route
                  path="/reports"
                  element={
                    <ProtectedPermissionRoute permission="inventory.view_asset">
                      <ReportsDashboard token={token} />
                    </ProtectedPermissionRoute>
                  }
                />
                <Route
                  path="/add-asset"
                  element={
                    <ProtectedPermissionRoute permission="inventory.add_asset">
                      <AddAsset token={token} />
                    </ProtectedPermissionRoute>
                  }
                />
                <Route
                  path="/assign"
                  element={
                    <ProtectedPermissionRoute permission="inventory.add_assetassignment">
                      <AssignAsset token={token} />
                    </ProtectedPermissionRoute>
                  }
                />
                <Route path="/return" element={<ReturnAsset token={token} />} />
                <Route path="/inspection" element={<AddAssetLog token={token} />} />
                <Route path="/inspection-report" element={<InspectionReport token={token} />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </div>
          )}
        </BrowserRouter>
      </UserContext.Provider>
    </ThemeProvider>
  );
}

export default App;