import test from 'node:test';
import assert from 'node:assert/strict';
import { localDate, reportRange } from './dates.js';
import { safeNextPath } from './navigation.js';
import { buildReportPdf } from './reports.js';
import { latestOpenInspection } from './inspections.js';
import { createApiClient } from '../lib/api.js';

test('report ranges preserve local calendar boundaries, including year and leap transitions', () => {
  assert.equal(localDate(new Date(2026, 8, 1, 0, 0)), '2026-09-01');
  assert.deepEqual(reportRange('this-month', new Date(2026, 8, 4)), ['2026-09-01', '2026-09-04']);
  assert.deepEqual(reportRange('previous-month', new Date(2026, 0, 4)), ['2025-12-01', '2025-12-31']);
  assert.deepEqual(reportRange('previous-month', new Date(2024, 2, 4)), ['2024-02-01', '2024-02-29']);
  assert.deepEqual(reportRange('quarter', new Date(2026, 8, 4)), ['2026-07-01', '2026-09-04']);
});

test('login preserves scan destinations and rejects external redirects', () => {
  assert.equal(safeNextPath('/scan/QA-furniture-1?source=qr'), '/scan/QA-furniture-1?source=qr');
  for (const path of ['https://other.example', '//other.example', '/\\other.example', '/login', '/reset-password/a/b']) {
    assert.equal(safeNextPath(path, '/portal'), '/portal');
  }
});

test('employee inspections always resolve to the most recently created open session', () => {
  const sessions = [
    { id: 12, status: 'OPEN', created_at: '2026-08-24T09:00:00Z' },
    { id: 14, status: 'CLOSED', created_at: '2026-09-07T10:00:00Z' },
    { id: 13, status: 'OPEN', created_at: '2026-09-01T09:00:00Z' },
  ];

  assert.equal(latestOpenInspection(sessions)?.id, 13);
  assert.equal(latestOpenInspection([{ id: 3, status: 'OPEN' }, { id: 5, status: 'OPEN' }])?.id, 5);
  assert.equal(latestOpenInspection([{ id: 7, status: 'CLOSED' }]), null);
});

test('API client deduplicates and briefly caches GET requests, then invalidates after writes', async () => {
  const calls = { get: 0, post: 0 };
  const transport = {
    get: async () => ({ data: { call: ++calls.get } }),
    post: async () => ({ data: { call: ++calls.post } }),
  };
  const api = createApiClient('test-token', { transport, cacheTtlMs: 1_000 });

  const [first, duplicate] = await Promise.all([api.get('/departments/'), api.get('/departments/')]);
  const cached = await api.get('/departments/');
  assert.equal(calls.get, 1);
  assert.equal(first, duplicate);
  assert.equal(first, cached);

  await api.post('/departments/', { name: 'QA' });
  await api.get('/departments/');
  assert.equal(calls.get, 2);
});

test('PDF export contains real data and paginates long tables', () => {
  const rows = Array.from({ length: 120 }, (_, index) => [`QA-${index}`, 'Test product', index]);
  const report = buildReportPdf('QA report', ['Code', 'Product', 'Quantity'], rows);
  assert.ok(report.getNumberOfPages() > 1);
  const contents = report.output();
  assert.ok(contents.startsWith('%PDF-'));
  assert.ok(contents.includes('QA-119'));
});
