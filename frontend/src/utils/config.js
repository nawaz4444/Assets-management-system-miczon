const currentLocation = typeof window === 'undefined'
    ? { hostname: 'localhost', protocol: 'http:', origin: 'http://localhost' }
    : window.location;
const localHost = ['localhost', '127.0.0.1', '[::1]'].includes(currentLocation.hostname);
export const BACKEND_BASE = (import.meta.env?.VITE_BACKEND_BASE || (localHost
    ? `${currentLocation.protocol}//${currentLocation.hostname}:8000`
    : currentLocation.origin)).replace(/\/$/, '');

export const API_BASE = `${BACKEND_BASE}/api`;
