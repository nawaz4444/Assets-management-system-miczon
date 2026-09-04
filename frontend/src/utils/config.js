const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(window.location.hostname);
export const BACKEND_BASE = (import.meta.env.VITE_BACKEND_BASE || (localHost
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : window.location.origin)).replace(/\/$/, '');

export const API_BASE = `${BACKEND_BASE}/api`;
