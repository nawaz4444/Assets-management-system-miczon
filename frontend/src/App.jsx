/* eslint-disable react-hooks/set-state-in-effect */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BrowserRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Login from './Login';
import ForgotPassword from './ForgotPassword';
import ResetPassword from './ResetPassword';
import { safeNextPath } from './utils/navigation';
import { API_BASE, BACKEND_BASE } from './utils/config';
import './styles.css';
import { UserContext, SuperCategoryContext } from './lib/contexts';
import { AppShell } from './pages';

export { UserContext, SuperCategoryContext, BACKEND_BASE };

function RequireLogin() {
  const location = useLocation();
  return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
}

function LoginDestination({ user }) {
  const location = useLocation();
  const next = new URLSearchParams(location.search).get('next') || sessionStorage.getItem('auth:next');
  return <Navigate to={safeNextPath(next, user?.is_superuser ? '/' : '/portal')} replace />;
}

function App() {
  const getInitialToken = () => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const urlUserId = params.get('user_id');
    if (urlToken) {
      localStorage.setItem('userToken', urlToken);
      if (urlUserId) localStorage.setItem('userId', urlUserId);
      window.history.replaceState({}, document.title, window.location.pathname);
      return urlToken;
    }
    return localStorage.getItem('userToken');
  };

  const [token, setToken] = useState(getInitialToken);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(!!token);

  const handleLogout = useCallback(() => {
    localStorage.removeItem('userToken');
    localStorage.removeItem('userId');
    ['inventory:filters', 'employees:filters', 'requests:filters', 'auth:next'].forEach(key => sessionStorage.removeItem(key));
    setToken(null);
    setUser(null);
  }, []);

  // Global 401 handler: if any authenticated request comes back unauthorized
  // (revoked/expired token), log the user out instead of leaving a half-broken session.
  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error?.response?.status === 401 && localStorage.getItem('userToken')) {
          handleLogout();
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, [handleLogout]);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    axios.get(`${API_BASE}/auth/current-user/`, {
      headers: { Authorization: `Token ${token}` },
    }).then((res) => {
      setUser(res.data);
    }).catch(() => {
      handleLogout();
    }).finally(() => {
      setLoading(false);
    });
  }, [token, handleLogout]);

  if (loading || (token && !user)) return <div className="loading-screen">Loading workspace...</div>;

  return (
    <UserContext.Provider value={{ user, setUser, loading, token }}>
      <BrowserRouter>
        {!token ? (
          <Routes>
            <Route path="/login" element={<Login setToken={setToken} />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:uid/:token" element={<ResetPassword />} />
            <Route path="*" element={<RequireLogin />} />
          </Routes>
        ) : (
          <Routes>
            <Route path="/login" element={<LoginDestination user={user} />} />
            <Route path="*" element={<AppShell token={token} handleLogout={handleLogout} />} />
          </Routes>
        )}
      </BrowserRouter>
    </UserContext.Provider>
  );
}

export default App;
