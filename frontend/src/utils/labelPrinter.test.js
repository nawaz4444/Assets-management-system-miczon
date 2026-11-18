import test from 'node:test';
import assert from 'node:assert/strict';
import { buildLabelPayload, sendLabelToPrinter, toPrinterText, wrapText } from './labelPrinter.js';

const QR = 'http://localhost:5173/scan/MZ-PHN-004';

test('label text keeps ID, wrapped device name and department within 4 lines of 12 characters', () => {
  const payload = buildLabelPayload({ miczon_id: 'MZ-PHN-004', name: 'Samsung Galaxy A54', department_name: 'Finance' }, QR);
  assert.deepEqual(payload.lines, ['MZ-PHN-004', 'Samsung', 'Galaxy A54', 'Finance']);
  assert.equal(payload.qr, QR);
  assert.equal(payload.copies, 1);
});

test('long, accented and missing values never produce an unprintable or oversized line', () => {
  const payload = buildLabelPayload({ miczon_id: 'MZ-LAPTOP-2026-0001', name: 'Café 中文 Extraordinarily Long Device Name', department_name: 'Human Resources' }, QR);
  assert.ok(payload.lines.length <= 4);
  for (const line of payload.lines) {
    assert.ok(line.length > 0 && line.length <= 12, line);
    assert.match(line, /^[\x20-\x7E]+$/);
  }
  assert.equal(payload.lines[0], 'MZ-LAPTOP-20');
  assert.equal(toPrinterText('Café'), 'Cafe');
  assert.deepEqual(buildLabelPayload({}, QR).lines, []);
  assert.deepEqual(buildLabelPayload(null, QR).lines, []);
});

test('QR-only labels carry no text lines', () => {
  assert.deepEqual(buildLabelPayload({ miczon_id: 'MZ-PHN-004', name: 'Samsung' }, QR, { qrOnly: true }).lines, []);
});

test('wrapText splits long words and cuts text beyond the line limit', () => {
  assert.deepEqual(wrapText('Extraordinarily', 12, 2), ['Extraordinar', 'ily']);
  assert.deepEqual(wrapText('aaa bbb ccc ddd eee', 7, 2), ['aaa bbb', 'ccc ddd']);
  assert.deepEqual(wrapText('', 12, 2), []);
});

test('sendLabelToPrinter posts to the local helper and reports success', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => ({ ok: true, copies: 1 }) }; };
  const result = await sendLabelToPrinter({ qr: QR, lines: ['A'], copies: 1 }, { fetchImpl });
  assert.equal(result.ok, true);
  assert.equal(calls[0].url, 'http://127.0.0.1:9101/print');
  assert.equal(calls[0].options.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].options.body), { qr: QR, lines: ['A'], copies: 1 });
});

test('sendLabelToPrinter explains a helper that is not running, a refusal, and a timeout', async () => {
  await assert.rejects(
    sendLabelToPrinter({ qr: QR }, { fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }),
    /helper is not running/,
  );
  await assert.rejects(
    sendLabelToPrinter({ qr: QR }, { fetchImpl: async () => ({ ok: false, json: async () => ({ ok: false, error: 'Printer was not found.' }) }) }),
    /Printer was not found\./,
  );
  await assert.rejects(
    sendLabelToPrinter({ qr: QR }, { fetchImpl: async () => ({ ok: false, json: async () => { throw new Error('not json'); } }) }),
    /could not print this label/,
  );
  await assert.rejects(
    sendLabelToPrinter({ qr: QR }, {
      timeoutMs: 20,
      fetchImpl: (url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(new Error('aborted')))),
    }),
    /helper is not running/,
  );
});
