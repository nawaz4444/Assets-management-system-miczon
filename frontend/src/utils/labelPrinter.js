// Sends an asset label to the local XP-365B print agent (scripts/xp365b-print-agent.ps1).
// Window printing cannot fit the 40 x 30 mm label, so the label is printed directly by that helper.

export const LABEL_AGENT_URL = (import.meta.env?.VITE_LABEL_AGENT_URL || 'http://127.0.0.1:9101').replace(/\/$/, '');
export const LABEL_AGENT_TIMEOUT_MS = 8000;

const LINE_WIDTH = 12;
const MAX_LINES = 4;

// The printer font only knows plain ASCII: drop accents, turn anything else into "?".
export function toPrinterText(value) {
  return String(value ?? '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\s+/g, ' ')
    .trim();
}

// Greedy word wrap to `width` characters; words longer than a line are split; text beyond `maxLines` is cut.
export function wrapText(text, width = LINE_WIDTH, maxLines = MAX_LINES) {
  const lines = [];
  let current = '';
  for (let word of String(text || '').split(' ').filter(Boolean)) {
    while (word.length > width) {
      if (current) { lines.push(current); current = ''; }
      lines.push(word.slice(0, width));
      word = word.slice(width);
    }
    if (!current) current = word;
    else if (current.length + 1 + word.length <= width) current += ` ${word}`;
    else { lines.push(current); current = word; }
  }
  if (current) lines.push(current);
  return lines.slice(0, Math.max(0, maxLines));
}

// QR on top, then up to 4 short lines: Miczon ID, device name, department. `qrOnly` prints the QR alone.
export function buildLabelPayload(asset, qrValue, { qrOnly = false, copies = 1 } = {}) {
  const payload = { qr: qrValue, lines: [], copies };
  if (qrOnly) return payload;

  const idLines = wrapText(toPrinterText(asset?.miczon_id), LINE_WIDTH, 2);
  let room = MAX_LINES - idLines.length;
  const nameLines = wrapText(toPrinterText(asset?.name), LINE_WIDTH, Math.min(2, room));
  room -= nameLines.length;
  const departmentLines = room > 0 ? wrapText(toPrinterText(asset?.department_name), LINE_WIDTH, 1) : [];
  payload.lines = [...idLines, ...nameLines, ...departmentLines];
  return payload;
}

export async function sendLabelToPrinter(payload, { fetchImpl = fetch, timeoutMs = LABEL_AGENT_TIMEOUT_MS } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  try {
    response = await fetchImpl(`${LABEL_AGENT_URL}/print`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
  } catch {
    throw new Error('Label printer helper is not running on this PC. Start scripts/xp365b-print-agent.ps1, then print again.');
  } finally {
    clearTimeout(timer);
  }

  let data = null;
  try { data = await response.json(); } catch { /* the helper always answers JSON; fall through to the generic message */ }
  if (!response.ok || !data?.ok) throw new Error(data?.error || 'The label printer helper could not print this label.');
  return data;
}
