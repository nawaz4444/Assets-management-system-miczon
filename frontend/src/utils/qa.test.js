import test from 'node:test';
import assert from 'node:assert/strict';
import { localDate, reportRange } from './dates.js';
import { safeNextPath } from './navigation.js';
import { buildReportPdf } from './reports.js';

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

test('PDF export contains real data and paginates long tables', () => {
  const rows = Array.from({ length: 120 }, (_, index) => [`QA-${index}`, 'Test product', index]);
  const report = buildReportPdf('QA report', ['Code', 'Product', 'Quantity'], rows);
  assert.ok(report.getNumberOfPages() > 1);
  const contents = report.output();
  assert.ok(contents.startsWith('%PDF-'));
  assert.ok(contents.includes('QA-119'));
});
