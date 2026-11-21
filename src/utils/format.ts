import {getSettings} from '../store/settings';
import {Soundbox} from '../native/Soundbox';

/** Indian digit grouping: 12,34,567.50 — no Intl dependency, fast on Hermes. */
export function groupIN(n: number, decimals = 2): string {
  const neg = n < 0;
  const fixed = Math.abs(n).toFixed(decimals);
  const [int, dec] = fixed.split('.');
  let out = int;
  if (int.length > 3) {
    const last3 = int.slice(-3);
    const rest = int.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    out = `${rest},${last3}`;
  }
  const d = dec && dec !== '00' ? `.${dec}` : '';
  return (neg ? '-' : '') + out + d;
}

export const money = (n: number) => `₹${groupIN(n)}`;

export function compactMoney(n: number) {
  const a = Math.abs(n);
  if (a >= 1e7) return `₹${(n / 1e7).toFixed(a >= 1e8 ? 0 : 1)}Cr`;
  if (a >= 1e5) return `₹${(n / 1e5).toFixed(a >= 1e6 ? 0 : 1)}L`;
  if (a >= 1e3) return `₹${(n / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
  return `₹${Math.round(n)}`;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pad = (n: number) => String(n).padStart(2, '0');

export function fmtTime(ts: number) {
  const d = new Date(ts);
  if (getSettings().time24) return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const h = d.getHours() % 12 || 12;
  return `${h}:${pad(d.getMinutes())} ${d.getHours() < 12 ? 'AM' : 'PM'}`;
}

export function fmtDate(ts: number) {
  const d = new Date(ts);
  const f = getSettings().dateFormat;
  if (f === 'MDY') return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
  if (f === 'YMD') return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

export const fmtDateLong = (ts: number) => {
  const d = new Date(ts);
  return `${DAYS[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

export const monthName = (m: number) => MONTHS[m];

export function dayLabel(ts: number) {
  const d0 = startOfDay(Date.now());
  const d = startOfDay(ts);
  if (d === d0) return 'Today';
  if (d === d0 - 86400000) return 'Yesterday';
  const dt = new Date(ts);
  return `${DAYS[dt.getDay()]}, ${dt.getDate()} ${MONTHS[dt.getMonth()]}`;
}

export function relTime(ts: number) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 45) return 'just now';
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return dayLabel(ts);
}

export function startOfDay(ts: number) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export const dayKey = (ts: number) => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export type PeriodId = 'today' | 'yesterday' | '7d' | '30d' | 'month' | 'prevMonth' | 'all' | 'custom';

export const PERIODS: {id: PeriodId; label: string}[] = [
  {id: 'today', label: 'Today'},
  {id: 'yesterday', label: 'Yesterday'},
  {id: '7d', label: '7 days'},
  {id: '30d', label: '30 days'},
  {id: 'month', label: 'This month'},
  {id: 'prevMonth', label: 'Last month'},
  {id: 'all', label: 'All time'},
];

export function periodRange(id: PeriodId, custom?: {from: number; to: number}): {from: number; to: number; label: string} {
  const now = Date.now();
  const today = startOfDay(now);
  const day = 86400000;
  const d = new Date(today);
  switch (id) {
    case 'today':
      return {from: today, to: today + day - 1, label: 'Today'};
    case 'yesterday':
      return {from: today - day, to: today - 1, label: 'Yesterday'};
    case '7d':
      return {from: today - 6 * day, to: today + day - 1, label: 'Last 7 days'};
    case '30d':
      return {from: today - 29 * day, to: today + day - 1, label: 'Last 30 days'};
    case 'month': {
      const from = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
      return {from, to: today + day - 1, label: `${MONTHS[d.getMonth()]} ${d.getFullYear()}`};
    }
    case 'prevMonth': {
      const from = new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime();
      const to = new Date(d.getFullYear(), d.getMonth(), 1).getTime() - 1;
      const pm = new Date(from);
      return {from, to, label: `${MONTHS[pm.getMonth()]} ${pm.getFullYear()}`};
    }
    case 'custom':
      return {from: custom?.from ?? today, to: custom?.to ?? today + day - 1, label: 'Custom range'};
    default:
      return {from: 0, to: now + day, label: 'All time'};
  }
}

export function haptic(ms = 10) {
  if (getSettings().haptics) Soundbox.vibrate(ms);
}

export const maskAcc = (last4?: string) => (last4 ? `•••• ${last4}` : '');

export const initials = (name?: string) =>
  (name ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase())
    .join('') || '?';
