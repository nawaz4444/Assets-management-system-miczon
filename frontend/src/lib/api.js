import { useMemo } from 'react';
import axios from 'axios';
import { API_BASE } from '../utils/config';

export function useApi(token) {
  return useMemo(() => {
    const headers = { Authorization: `Token ${token}` };
    return {
      get: (url, config = {}) => axios.get(`${API_BASE}${url}`, { ...config, headers }),
      post: (url, data = {}, config = {}) => axios.post(`${API_BASE}${url}`, data, { ...config, headers }),
      put: (url, data = {}, config = {}) => axios.put(`${API_BASE}${url}`, data, { ...config, headers }),
      patch: (url, data = {}, config = {}) => axios.patch(`${API_BASE}${url}`, data, { ...config, headers }),
      delete: (url, config = {}) => axios.delete(`${API_BASE}${url}`, { ...config, headers }),
    };
  }, [token]);
}

export function normalizeList(payload) {
  if (Array.isArray(payload)) return payload;
  return payload?.results || [];
}

export function toApiPath(url) {
  if (!url) return '';
  if (url.startsWith('http')) {
    const parsed = new URL(url);
    return `${parsed.pathname.replace('/api', '')}${parsed.search}`;
  }
  return url;
}

export function getQrPayload(miczonId) {
  return `${window.location.origin}/scan/${encodeURIComponent(miczonId || '')}`;
}

export function extractMiczonIdFromScan(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';

  try {
    const parsed = new URL(rawValue);
    const scanIndex = parsed.pathname.split('/').filter(Boolean).findIndex((part) => part.toLowerCase() === 'scan');
    if (scanIndex >= 0) {
      return decodeURIComponent(parsed.pathname.split('/').filter(Boolean)[scanIndex + 1] || '');
    }
  } catch {
    // Plain Miczon IDs are also accepted for manual testing and fallback scanners.
  }

  return rawValue.replace(/^.*\/scan\//i, '').trim();
}

export async function fetchAll(api, initialPath) {
  const rows = [];
  let path = initialPath;
  while (path) {
    const response = await api.get(toApiPath(path));
    rows.push(...normalizeList(response.data));
    path = response.data?.next || '';
  }
  return rows;
}
