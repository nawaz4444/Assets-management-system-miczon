export function safeNextPath(value, fallback = '/') {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return fallback;
  const path = value.split(/[?#]/)[0];
  return ['/login', '/forgot-password'].includes(path) || path.startsWith('/reset-password/') ? fallback : value;
}
