import { useMemo } from 'react';
import axios from 'axios';
import { API_BASE } from '../utils/config.js';

const DEFAULT_GET_CACHE_TTL_MS = 30_000;

export function apiError(error, fallback = 'Unable to complete this action.') {
  const data = error?.response?.data;
  if (!data || typeof data !== 'object' || data instanceof Blob) return fallback;
  const flatten = value => Array.isArray(value) ? value.map(flatten).join(' ') : typeof value === 'object' && value !== null ? Object.entries(value).map(([key, item]) => `${key}: ${flatten(item)}`).join(' ') : String(value);
  return flatten(data.error || data.message || data.detail || data) || fallback;
}

export function createApiClient(token, { transport = axios, cacheTtlMs = DEFAULT_GET_CACHE_TTL_MS } = {}) {
  const responseCache = new Map();
  const inFlightGets = new Map();
  let cacheGeneration = 0;

  const requestConfig = (config = {}) => ({
    ...config,
    headers: { ...config.headers, Authorization: `Token ${token}` },
  });

  const invalidateCache = () => {
    cacheGeneration += 1;
    responseCache.clear();
    inFlightGets.clear();
  };

  const get = (url, config = {}) => {
    const { cache = true, ...axiosConfig } = config;
    const fullUrl = `${API_BASE}${url}`;
    const cacheable = cache && !axiosConfig.signal && !axiosConfig.responseType;
    if (!cacheable) return transport.get(fullUrl, requestConfig(axiosConfig));

    const cacheKey = `${fullUrl}|${JSON.stringify(axiosConfig.params || null)}`;
    const cached = responseCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.response);
    if (inFlightGets.has(cacheKey)) return inFlightGets.get(cacheKey);

    const requestGeneration = cacheGeneration;
    let request;
    request = transport.get(fullUrl, requestConfig(axiosConfig))
      .then((response) => {
        if (requestGeneration === cacheGeneration) {
          responseCache.set(cacheKey, { response, expiresAt: Date.now() + cacheTtlMs });
        }
        return response;
      })
      .finally(() => {
        if (inFlightGets.get(cacheKey) === request) inFlightGets.delete(cacheKey);
      });
    inFlightGets.set(cacheKey, request);
    return request;
  };

  const mutate = (method, url, data, config = {}) => {
    const args = method === 'delete'
      ? [`${API_BASE}${url}`, requestConfig(config)]
      : [`${API_BASE}${url}`, data, requestConfig(config)];
    return transport[method](...args).then((response) => {
      invalidateCache();
      return response;
    });
  };

  return {
    get,
    post: (url, data = {}, config = {}) => mutate('post', url, data, config),
    put: (url, data = {}, config = {}) => mutate('put', url, data, config),
    patch: (url, data = {}, config = {}) => mutate('patch', url, data, config),
    delete: (url, config = {}) => mutate('delete', url, undefined, config),
  };
}

export function useApi(token) {
  return useMemo(() => createApiClient(token), [token]);
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
