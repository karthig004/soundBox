import {detectBank, sourceForEvent, SHARE_SOURCE} from './sources';
import type {Direction, ParsedTxn, RawEvent, SourceCategory, TxnKind, TxnStatus} from './types';

const NUM = '([0-9][0-9,]*(?:\\.[0-9]{1,2})?)';
const AMOUNT_BEFORE = new RegExp(`(?:₹|\\brs\\.?|\\binr|rupees)\\s*${NUM}`, 'gi');
const AMOUNT_AFTER = new RegExp(`\\b${NUM}\\s*(?:rs\\b\\.?|inr\\b|rupees|₹|रुपये)`, 'gi');
const AMOUNT_VERB = new RegExp(`\\b(?:debited|credited)\\s+(?:by|for|with)\\s+(?:rs\\.?|inr|₹)?\\s*${NUM}`, 'i');
/** Amounts directly after these words are balances/limits, never the transaction. */
const NOT_TXN_AMOUNT = /(bal(?:ance)?|limit|avl|available|outstanding|due|cashback (?:of )?up ?to|upto)\s*(?:is|of|:|-|\.)?\s*(?:rs\.?|inr|₹)?\s*$/i;

const CREDIT_RES: RegExp[] = [
  /\b(?:paid|sent|transferred)\s+you\b/i,
  /\breceived\b/i,
  /\bcredited\b/i,
  /\bdeposited\b/i,
  /\badded\s+to\s+(?:your\s+)?(?:a\/c|account|wallet|bank)/i,
  /\bmoney\s+in\b/i,
  /प्राप्त|जमा/,
  /பெறப்பட்டது|வரவு/,
];
const DEBIT_RES: RegExp[] = [
  /\bdebited\b/i,
  /\bspent\b/i,
  /\bwithdrawn\b|\bwithdrawal\b/i,
  /\bdeducted\b/i,
  /\b(?:paid|sent|transferred)\b(?!\s+you\b)/i,
  /\bpurchase\b/i,
  /\btrf\s+to\b/i,
  /\bmoney\s+out\b/i,
  /डेबिट|भुगतान/,
  /பற்று/,
];
const REFUND_RE = /\brefund(?:ed)?\b|रिफंड/i;
const REVERSAL_RE = /\brevers(?:al|ed)\b|\breverted\b/i;
const FAILED_RE = /\b(?:failed|declined|unsuccessful|not successful|could not be (?:processed|completed)|rejected|has failed)\b/i;
const PENDING_RE = /\b(?:pending|processing|in progress|initiated|awaiting|under process|will be (?:credited|refunded|reversed))\b/i;
/** Fraud-warning boilerplate that would otherwise confuse status/direction checks. */
const BOILERPLATE = /(?:if (?:this (?:was|is) )?not (?:initiated |done |made )?(?:by )?you[^.]*\.?|not you\?[^.]*\.?|never share[^.]*\.?|do not share[^.]*\.?)/gi;

const OTP_RE = /\b(?:otp|one[- ]time password|verification code|passcode|security code)\b/i;
const REQUEST_RE = /\b(?:has requested|requested (?:money|payment|₹|rs|inr)|collect request|payment request|requesting)\b/i;
const PROMO_RE = /\b(?:offer|win\b|reward|loan|pre-?approved|eligible|limit (?:increased|enhanced)|emi\b|due date|bill (?:is )?due|statement|recharge now|upgrade|kyc)\b/i;
const BALANCE_ONLY_RE = /\b(?:available balance|avl\.? bal|balance is|bal:|a\/c balance)\b/i;

const NAME = "([A-Za-z][A-Za-z0-9 .&'\\-]{0,40}?)";
const STOP = "(?=\\s*(?:\\(|\\bon\\b|\\bvia\\b|\\bupi\\b|\\bref|\\bto\\b|\\bin\\b|\\bthrough\\b|\\bat\\b|\\bdated\\b|\\bfor\\b|\\bwith\\b|\\bavl|\\binr\\b|\\brs\\b|₹|[.,;:!|]|\\s-|$))";
const SENDER_RES: RegExp[] = [
  new RegExp(`^${NAME}\\s+(?:has\\s+)?(?:paid|sent)\\s+you`, 'i'),
  // "by VPA kumar@oksbi KUMAR TRADERS (UPI Ref …)" — name follows the VPA
  new RegExp(`\\b(?:by|from)\\s+(?:vpa\\s+)?[a-z0-9.\\-_]+@[a-z]+\\s+${NAME}${STOP}`, 'i'),
  new RegExp(`\\b(?:received|credited|payment)\\b[\\s\\S]{0,80}?\\bfrom\\s+(?:vpa\\s+|a\\/c\\s+|upi\\s+|mr\\.?\\s+|ms\\.?\\s+)?${NAME}${STOP}`, 'i'),
  new RegExp(`\\b(?:credited|received)\\b[\\s\\S]{0,60}?\\bby\\s+(?:vpa\\s+|upi\\s+)?${NAME}${STOP}`, 'i'),
  new RegExp(`\\bfrom\\s+${NAME}${STOP}`, 'i'),
];
const BENEFICIARY_RES: RegExp[] = [
  new RegExp(`\\b(?:paid|sent|transferred|trf|payment|transfer|debited)\\b[\\s\\S]{0,60}?\\bto\\s+(?:vpa\\s+|a\\/c\\s+|mr\\.?\\s+|ms\\.?\\s+)?${NAME}${STOP}`, 'i'),
  new RegExp(`;\\s*${NAME}\\s+credited`, 'i'),
  new RegExp(`\\bspent\\b[\\s\\S]{0,60}?\\bat\\s+${NAME}${STOP}`, 'i'),
];
const NAME_STOPWORDS = new Set([
  'rs', 'inr', 'upi', 'a', 'ac', 'acct', 'vpa', 'you', 'your', 'the', 'neft', 'imps', 'rtgs', 'account', 'bank',
  'a/c', 'mr', 'ms', 'self', 'linked', 'xx', 'customer', 'user', 'beneficiary', 'merchant', 'wallet', 'card',
]);
const TITLE_NOT_NAME = /received|payment|paid|money|transaction|bank|upi|alert|credited|debited|google|phonepe|paytm|bhim|amazon|success|update|\d/i;

const LAST4_RES: RegExp[] = [
  /\b(?:a\/c|acct|account|ac|card)\s*(?:no\.?|number)?\s*(?:ending\s*(?:with|in)?)?\s*[:\-]?\s*[x*#.\s]*(\d{3,6})\b/i,
  /\b(?:xx+|\*{2,}|x)(\d{3,6})\b/i,
];
const REF_RES: RegExp[] = [
  /\bupi\s*(?:ref(?:erence)?|txn|transaction)?\.?\s*(?:no|number|id)?\.?\s*[:.\-#]?\s*(\d{9,18})\b/i,
  /\b(?:utr|rrn|ref(?:erence)?|txn|transaction)\s*(?:no|number|id)?\.?\s*[:.\-#]?\s*([A-Z0-9]{8,24})\b/i,
];
const UPI_RE = /\b([a-z0-9][a-z0-9.\-_]{1,63}@[a-z][a-z0-9]{1,31})\b(?!\.[a-z])/i;

function toNum(s: string) {
  return parseFloat(s.replace(/,/g, ''));
}

export function extractAmount(text: string): number | undefined {
  const candidates: {v: number; at: number}[] = [];
  for (const re of [AMOUNT_BEFORE, AMOUNT_AFTER]) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text))) {
      const before = text.slice(Math.max(0, m.index - 28), m.index);
      if (NOT_TXN_AMOUNT.test(before)) continue;
      const v = toNum(m[1]);
      if (v > 0 && v < 1e10) candidates.push({v, at: m.index});
    }
  }
  if (candidates.length) {
    candidates.sort((a, b) => a.at - b.at);
    return candidates[0].v;
  }
  const verb = AMOUNT_VERB.exec(text);
  if (verb) return toNum(verb[1]);
  return undefined;
}

function firstIndex(res: RegExp[], text: string) {
  let best = -1;
  for (const re of res) {
    const m = re.exec(text);
    if (m && (best < 0 || m.index < best)) best = m.index;
  }
  return best;
}

export function detectDirection(text: string): Direction | undefined {
  const c = firstIndex(CREDIT_RES, text);
  const d = firstIndex(DEBIT_RES, text);
  if (c < 0 && d < 0) return undefined;
  if (c < 0) return 'debit';
  if (d < 0) return 'credit';
  return c < d ? 'credit' : 'debit';
}

export function cleanName(raw?: string): string | undefined {
  if (!raw) return undefined;
  let s = raw.replace(/\s+/g, ' ').replace(/[.\-&' ]+$/, '').trim();
  s = s.replace(/^(?:mr|mrs|ms|shri|smt)\.?\s+/i, '');
  if (s.length < 2 || s.length > 40) return undefined;
  if (NAME_STOPWORDS.has(s.toLowerCase())) return undefined;
  if (/^(?:your|a\/c|acct|account|bank|upi)\b/i.test(s)) return undefined;
  if ((s.match(/\d/g)?.length ?? 0) > s.length / 3) return undefined;
  if (detectBank(s) && s.split(' ').length <= 3) return undefined;
  if (s === s.toUpperCase()) {
    s = s.toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
  }
  return s;
}

function firstName(res: RegExp[], ...texts: string[]) {
  for (const re of res) {
    for (const t of texts) {
      const m = re.exec(t);
      const n = cleanName(m?.[1]);
      if (n) return n;
    }
  }
  return undefined;
}

function firstMatch(res: RegExp[], text: string, valid?: (s: string) => boolean) {
  for (const re of res) {
    const m = re.exec(text);
    if (m && (!valid || valid(m[1]))) return m[1];
  }
  return undefined;
}

function resolveSource(ev: RawEvent): {id: string; name: string; category: SourceCategory; bank?: string} {
  if (ev.origin === 'share') return {...SHARE_SOURCE};
  const def = sourceForEvent(ev);
  if (def) return {id: def.id, name: def.name, category: def.category, bank: def.bank};
  return {id: `app:${ev.pkg}`, name: ev.pkg, category: 'upi'};
}

/** Parses one raw notification. Returns null when nothing money-like is present. */
export function parseEvent(ev: RawEvent): ParsedTxn | null {
  const body = [ev.bigText && ev.bigText.length >= (ev.text?.length ?? 0) ? ev.bigText : ev.text, ev.subText]
    .filter(Boolean)
    .join(' • ');
  const full = `${ev.title ?? ''} • ${body}`.replace(/\s+/g, ' ').trim();
  const core = full.replace(BOILERPLATE, ' ');
  const src = resolveSource(ev);
  const notes: string[] = [];

  const amount = extractAmount(core);
  let direction = detectDirection(core);
  let kind: TxnKind = 'payment';
  if (REVERSAL_RE.test(core)) {
    kind = 'reversal';
    direction = 'credit';
  } else if (REFUND_RE.test(core)) {
    kind = 'refund';
    direction = 'credit';
  }
  let status: TxnStatus = 'success';
  if (FAILED_RE.test(core)) status = 'failed';
  else if (PENDING_RE.test(core)) status = 'pending';

  const base = {
    amount: amount ?? 0,
    direction,
    kind,
    status,
    sourceId: src.id,
    sourceName: src.name,
    sourceCategory: src.category,
    notes,
  };

  if (amount === undefined && !direction) return null;

  // Informational notifications are recorded in diagnostics only, never announced (PRD 9.2 #7).
  const info = (reason: string): ParsedTxn => ({...base, informational: true, infoReason: reason});
  if (OTP_RE.test(core)) return info('OTP / verification message');
  if (REQUEST_RE.test(core) && !/\b(?:credited|debited)\b/i.test(core)) return info('Payment request (not a transaction)');
  if (!direction && BALANCE_ONLY_RE.test(core)) return info('Balance update');
  if (!direction && PROMO_RE.test(core)) return info('Promotional / reminder');
  // Whether an SMS sender is a bank is decided in processor.ts from the sender code (senders.ts),
  // never from the message text — a friend's SMS can mention "HDFC" too.

  const bank = src.bank ?? detectBank(core);
  const last4raw = firstMatch(LAST4_RES, core);
  const last4 = last4raw ? last4raw.slice(-4) : undefined;
  const reference = firstMatch(REF_RES, core, s => /\d{6,}/.test(s));
  const upiId = UPI_RE.exec(core)?.[1]?.toLowerCase();

  let sender: string | undefined;
  let beneficiary: string | undefined;
  if (direction === 'credit') {
    sender = firstName(SENDER_RES, ev.title ?? '', core);
    if (!sender && src.category === 'upi') {
      const t = (ev.title ?? '').trim();
      if (t && !TITLE_NOT_NAME.test(t) && t.length <= 40) {
        sender = cleanName(t);
        if (sender) notes.push('sender taken from notification title');
      }
    }
  } else if (direction === 'debit') {
    beneficiary = firstName(BENEFICIARY_RES, ev.title ?? '', core);
  }

  if (amount === undefined) notes.push('amount not found');
  if (!direction) notes.push('credit/debit not determinable');
  if (!reference) notes.push('no transaction reference');

  return {
    ...base,
    informational: false,
    bank,
    last4,
    sender,
    beneficiary,
    upiId,
    reference,
  };
}

/** Lightweight content hash for exact-duplicate detection. */
export function textHash(s: string): string {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h1 ^= s.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return (h1 >>> 0).toString(36);
}
