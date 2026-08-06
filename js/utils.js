// Shared helpers for the public site and admin dashboard.

export const CATEGORY_ORDER = [
  'Espresso',
  'Brewed Coffee',
  'Tea',
  'Specialty & Seasonal',
  'Non-Coffee',
  'Extras'
];

export const DAY_LABELS = [
  ['mon', 'Monday'],
  ['tue', 'Tuesday'],
  ['wed', 'Wednesday'],
  ['thu', 'Thursday'],
  ['fri', 'Friday'],
  ['sat', 'Saturday'],
  ['sun', 'Sunday']
];

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

export function formatTime(t) {
  if (!t) return '';
  const [hStr, mStr] = String(t).split(':');
  let h = parseInt(hStr, 10);
  if (Number.isNaN(h)) return '';
  const m = (mStr || '00').padStart(2, '0');
  const suffix = h >= 12 ? 'pm' : 'am';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m}${suffix}`;
}
