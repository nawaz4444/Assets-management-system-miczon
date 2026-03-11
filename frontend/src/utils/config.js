export const BACKEND_BASE = window.location.origin.includes('localhost') || window.location.origin.includes('127.0.0.1')
    ? 'http://localhost:8000'
    : window.location.origin;

export const API_BASE = `${BACKEND_BASE}/api`;
