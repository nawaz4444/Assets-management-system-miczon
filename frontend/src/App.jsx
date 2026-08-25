/* eslint-disable react-refresh/only-export-components, react-hooks/set-state-in-effect */
import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Login from './Login';
import { API_BASE, BACKEND_BASE } from './utils/config';
import './styles.css';
import { UserContext, SuperCategoryContext } from './lib/contexts';
import { AppShell } from './pages';

export { UserContext, SuperCategoryContext, BACKEND_BASE };

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

  if (loading) return <div className="loading-screen">Loading workspace...</div>;

  return (
    <UserContext.Provider value={{ user, setUser, loading, token }}>
      <BrowserRouter>
        {!token ? (
          <Routes>
            <Route path="/login" element={<Login setToken={setToken} />} />
            {/* Password-reset routes disabled until backend endpoints + SMTP exist.
                Re-enable the imports above and these routes to restore the flow. */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        ) : (
          <AppShell token={token} handleLogout={handleLogout} />
        )}
      </BrowserRouter>
    </UserContext.Provider>
  );
}

export default App;
