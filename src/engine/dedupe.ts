import type {Direction, Txn, TxnStatus} from './types';

export interface Candidate {
  amount: number;
  direction?: Direction;
  status: TxnStatus;
  kind: Txn['kind'];
  reference?: string;
  sender?: string;
  beneficiary?: string;
  accountId?: string;
  sourceId: string;
  timestamp: number;
  hash: string;
  key?: string;
}

export type DedupeResult =
  | {type: 'new'}
  | {type: 'duplicate'; existing: Txn; reason: string}
  | {type: 'update'; existing: Txn; reason: string};

const CROSS_SOURCE_WINDOW = 3 * 60 * 1000;
const SAME_HASH_WINDOW = 30 * 60 * 1000;
const PENDING_FOLLOWUP_WINDOW = 60 * 60 * 1000;
const STATUS_RANK: Record<TxnStatus, number> = {pending: 0, failed: 1, success: 2};

const norm = (s?: string) => (s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

function namesCompatible(a?: string, b?: string) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return true;
  return x === y || x.startsWith(y) || y.startsWith(x);
}

function sameMoney(c: Candidate, t: Txn) {
  return Math.abs(t.amount - c.amount) < 0.005 && (!c.direction || t.direction === c.direction || t.direction === 'unknown');
}

/**
 * Decides whether a freshly parsed notification is new, an exact/cross-source duplicate,
 * or a status update of something already recorded (PRD 10).
 * `recent` should be newest-first and may be limited to the last few days.
 */
export function checkDuplicate(c: Candidate, recent: Txn[]): DedupeResult {
  for (const t of recent) {
    if (c.timestamp - t.timestamp > 3 * 24 * 3600 * 1000) break;

    // 1. Same reference number = same transaction, whichever app reported it.
    if (c.reference && t.reference && c.reference === t.reference) {
      if (!sameMoney(c, t)) continue; // same ref but different money: refund/reversal share refs sometimes
      if (t.kind !== c.kind) continue;
      if (STATUS_RANK[c.status] > STATUS_RANK[t.status]) {
        return {type: 'update', existing: t, reason: `status ${t.status} → ${c.status} (ref ${c.reference})`};
      }
      return {type: 'duplicate', existing: t, reason: `same reference ${c.reference}`};
    }

    const dt = Math.abs(c.timestamp - t.timestamp);

    // 2. Exact same notification text re-posted.
    if (t.raw?.hash === c.hash && dt < SAME_HASH_WINDOW) {
      return {type: 'duplicate', existing: t, reason: 'identical notification re-posted'};
    }

    // 3. Pending followed by success/failure from the same source (no reference available).
    if (
      t.status === 'pending' && c.status !== 'pending' && t.source.id === c.sourceId &&
      sameMoney(c, t) && dt < PENDING_FOLLOWUP_WINDOW &&
      (!c.reference || !t.reference) &&
      namesCompatible(c.sender ?? c.beneficiary, t.sender ?? t.beneficiary)
    ) {
      return {type: 'update', existing: t, reason: `pending → ${c.status} (same source, same amount)`};
    }

    // 4. Out-of-order: pending arriving after the success it belongs to.
    if (
      c.status === 'pending' && t.status !== 'pending' && t.source.id === c.sourceId &&
      sameMoney(c, t) && dt < PENDING_FOLLOWUP_WINDOW && (!c.reference || !t.reference)
    ) {
      return {type: 'duplicate', existing: t, reason: 'late pending notice for an already completed transaction'};
    }

    // 5. Same payment reported by two different apps (e.g. GPay + bank SMS) close together.
    //    Same-source notifications with no reference stay separate: two ₹100 payments from
    //    one customer a minute apart are two payments (PRD 10.4).
    if (
      t.source.id !== c.sourceId && dt < CROSS_SOURCE_WINDOW && sameMoney(c, t) &&
      t.kind === c.kind && (!c.reference || !t.reference) &&
      (!c.accountId || !t.accountId || c.accountId === t.accountId) &&
      namesCompatible(c.sender ?? c.beneficiary, t.sender ?? t.beneficiary) &&
      !hasNewerSameSourceTwin(t, recent)
    ) {
      return {type: 'duplicate', existing: t, reason: `same payment also reported by ${t.source.name}`};
    }
  }
  return {type: 'new'};
}

/** Avoid merging into a txn that already absorbed a cross-source twin. */
function hasNewerSameSourceTwin(t: Txn, _recent: Txn[]) {
  return (t.mergedEvents ?? 0) >= 3;
}

/** Fields from a duplicate that can enrich the stored record without overwriting evidence. */
export function mergeMissing(t: Txn, c: Partial<Txn>): Partial<Txn> {
  const patch: Partial<Txn> = {};
  (['reference', 'sender', 'beneficiary', 'upiId', 'bank', 'last4', 'accountId'] as const).forEach(k => {
    if (!t[k] && c[k]) (patch as any)[k] = c[k];
  });
  return patch;
}
