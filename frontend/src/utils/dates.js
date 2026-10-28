// Date inputs represent local calendar days, not UTC instants.
export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function reportRange(preset, today = new Date()) {
  const year = today.getFullYear();
  const month = today.getMonth();
  if (preset === 'this-month') return [localDate(new Date(year, month, 1)), localDate(today)];
  if (preset === 'previous-month') return [localDate(new Date(year, month - 1, 1)), localDate(new Date(year, month, 0))];
  if (preset === 'quarter') return [localDate(new Date(year, Math.floor(month / 3) * 3, 1)), localDate(today)];
  if (preset === 'year') return [localDate(new Date(year, 0, 1)), localDate(today)];
  return ['', ''];
}
