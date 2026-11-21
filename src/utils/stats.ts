import type {Txn} from '../engine/types';
import {dayKey} from './format';

/** Only recognised, successful, non-excluded money movements count toward totals. */
export const effDirection = (t: Txn) => t.corrections?.direction ?? t.direction;

export const countsInTotals = (t: Txn) =>
  t.status === 'success' && effDirection(t) !== 'unknown' && t.amount > 0 && !t.excluded && !t.irrelevant;
export const party = (t: Txn) =>
  effDirection(t) === 'credit' ? t.corrections?.sender ?? t.sender : t.corrections?.beneficiary ?? t.beneficiary;

export function inRange(txns: Txn[], from: number, to: number) {
  return txns.filter(t => t.timestamp >= from && t.timestamp <= to);
}

export interface Summary {
  received: number;
  sent: number;
  refunds: number;
  net: number;
  creditCount: number;
  debitCount: number;
  count: number;
  unknown: number;
  pending: number;
  failed: number;
  review: number;
  avgTicket: number;
  largest: number;
}

export function summarize(txns: Txn[]): Summary {
  const s: Summary = {received: 0, sent: 0, refunds: 0, net: 0, creditCount: 0, debitCount: 0, count: 0, unknown: 0, pending: 0, failed: 0, review: 0, avgTicket: 0, largest: 0};
  for (const t of txns) {
    if (t.irrelevant) continue;
    if (t.category === 'unknown') s.unknown++;
    if (t.status === 'pending') s.pending++;
    if (t.status === 'failed') s.failed++;
    if (t.review) s.review++;
    if (!countsInTotals(t)) continue;
    s.count++;
    const dir = effDirection(t);
    if (t.kind === 'refund' || t.kind === 'reversal') {
      s.refunds += t.amount;
      s.creditCount++;
    } else if (dir === 'credit') {
      s.received += t.amount;
      s.creditCount++;
      if (t.amount > s.largest) s.largest = t.amount;
    } else {
      s.sent += t.amount;
      s.debitCount++;
    }
  }
  s.net = s.received + s.refunds - s.sent;
  s.avgTicket = s.creditCount ? (s.received + s.refunds) / s.creditCount : 0;
  return s;
}

export function hourly(txns: Txn[]) {
  const h = new Array(24).fill(0);
  for (const t of txns) if (countsInTotals(t) && effDirection(t) === 'credit') h[new Date(t.timestamp).getHours()] += t.amount;
  return h as number[];
}

export interface DayRow {
  key: string;
  ts: number;
  received: number;
  sent: number;
  refunds: number;
  net: number;
  count: number;
}

export function byDay(txns: Txn[], from: number, to: number): DayRow[] {
  const map = new Map<string, DayRow>();
  const day = 86400000;
  const span = Math.min(Math.ceil((to - from) / day), 400);
  for (let i = 0; i < span; i++) {
    const ts = from + i * day;
    map.set(dayKey(ts), {key: dayKey(ts), ts, received: 0, sent: 0, refunds: 0, net: 0, count: 0});
  }
  for (const t of txns) {
    if (!countsInTotals(t)) continue;
    const k = dayKey(t.timestamp);
    let r = map.get(k);
    if (!r) {
      r = {key: k, ts: t.timestamp, received: 0, sent: 0, refunds: 0, net: 0, count: 0};
      map.set(k, r);
    }
    r.count++;
    if (t.kind !== 'payment') r.refunds += t.amount;
    else if (effDirection(t) === 'credit') r.received += t.amount;
    else r.sent += t.amount;
    r.net = r.received + r.refunds - r.sent;
  }
  return [...map.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export interface GroupRow {
  key: string;
  label: string;
  sub?: string;
  received: number;
  sent: number;
  count: number;
}

export function groupBy(txns: Txn[], keyFn: (t: Txn) => {key: string; label: string; sub?: string} | null): GroupRow[] {
  const map = new Map<string, GroupRow>();
  for (const t of txns) {
    if (!countsInTotals(t)) continue;
    const k = keyFn(t);
    if (!k) continue;
    let r = map.get(k.key);
    if (!r) {
      r = {...k, received: 0, sent: 0, count: 0};
      map.set(k.key, r);
    }
    r.count++;
    if (effDirection(t) === 'credit') r.received += t.amount;
    else r.sent += t.amount;
  }
  return [...map.values()].sort((a, b) => b.received + b.sent - (a.received + a.sent));
}

/** Items that need the user's attention (PRD 18): unidentified, unassigned or flagged. */
export const needsReview = (t: Txn, hasAccounts: boolean) =>
  !t.irrelevant && (t.category === 'unknown' || t.review || (hasAccounts && !t.accountId && t.direction !== 'unknown' && !t.corrections?.accountId));
