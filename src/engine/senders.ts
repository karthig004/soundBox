/**
 * Classifies who sent an SMS, using the TRAI/DLT sender code.
 *
 *   JM-TMBANK-S
 *   ││ │      └─ category: S service, T transactional (accepted) · P promotional, G government (rejected)
 *   ││ └──────── 6-char header registered by the bank — fixed, but a bank often registers several
 *   └┴────────── operator + telecom circle — changes from message to message (JM, SL, AD, VK…)
 *
 * Phones show the same sender as "JM-TMBANK-S", "SL-TMBANK", "JMTMBANK" or just "TMBANK", so we
 * ignore the prefix/category and match on the header. Personal SMS come from phone numbers or
 * contact names, never from such a code. Only a bank header can raise a sound.
 */

export type SenderClass =
  | {kind: 'bank'; header: string; bank: string; via: 'known' | 'trusted' | 'account'}
  | {kind: 'business'; header: string; likelyBank?: string} // a business code we can't confirm is your bank
  | {kind: 'promotional'; header: string}
  | {kind: 'government'; header: string}
  | {kind: 'personal'; raw: string} // phone number or contact name
  | {kind: 'none'};

/** Exact headers known to belong to a bank. */
export const BANK_HEADERS: Record<string, string> = {
  HDFCBK: 'HDFC Bank', HDFCBN: 'HDFC Bank', HDFCCC: 'HDFC Bank',
  SBIINB: 'SBI', SBIUPI: 'SBI', SBIPSG: 'SBI', CBSSBI: 'SBI', ATMSBI: 'SBI', SBICRD: 'SBI', SBMSMS: 'SBI',
  ICICIB: 'ICICI Bank', ICICIT: 'ICICI Bank', ICICIO: 'ICICI Bank',
  AXISBK: 'Axis Bank', AXISMR: 'Axis Bank',
  KOTAKB: 'Kotak Bank', KOTAKM: 'Kotak Bank', KMBLTD: 'Kotak Bank',
  PNBSMS: 'Punjab National Bank', PNBBNK: 'Punjab National Bank',
  BOBTXN: 'Bank of Baroda', BOBSMS: 'Bank of Baroda', BOBCRD: 'Bank of Baroda',
  CANBNK: 'Canara Bank',
  UNIONB: 'Union Bank', UBOIBK: 'Union Bank',
  IOBCHN: 'Indian Overseas Bank', IOBBNK: 'Indian Overseas Bank',
  INDBNK: 'Indian Bank',
  BOIIND: 'Bank of India',
  CENTBK: 'Central Bank',
  IDFCFB: 'IDFC First Bank',
  YESBNK: 'Yes Bank',
  INDUSB: 'IndusInd Bank', INDUSL: 'IndusInd Bank',
  FEDBNK: 'Federal Bank',
  KVBANK: 'Karur Vysya Bank',
  CUBANK: 'City Union Bank', CUBLTD: 'City Union Bank',
  TMBANK: 'Tamilnad Mercantile Bank', TMBLTD: 'Tamilnad Mercantile Bank',
  SIBSMS: 'South Indian Bank',
  AUBANK: 'AU Small Finance Bank',
  PAYTMB: 'Paytm Payments Bank',
  AIRBNK: 'Airtel Payments Bank',
  IPBMSG: 'India Post Payments Bank',
  RBLBNK: 'RBL Bank',
  BANDHN: 'Bandhan Bank',
  UCOBNK: 'UCO Bank',
  MAHABK: 'Bank of Maharashtra',
  KTKBNK: 'Karnataka Bank',
  JKBANK: 'J&K Bank',
  DCBBNK: 'DCB Bank',
  HSBCIN: 'HSBC',
  DBSBNK: 'DBS Bank',
  EQUTAS: 'Equitas Bank',
  UJJIVN: 'Ujjivan Bank',
};

/**
 * Bank "stems": the part every header of that bank starts with. A header with a stem only *looks*
 * like that bank — it's confirmed when the SMS is also about one of the user's own accounts.
 * Longer stems first so "UNIONB" wins over shorter overlaps.
 */
export const BANK_STEMS: [string, string][] = [
  ['HDFC', 'HDFC Bank'], ['SBI', 'SBI'], ['ICICI', 'ICICI Bank'], ['AXIS', 'Axis Bank'], ['KOTAK', 'Kotak Bank'],
  ['PNB', 'Punjab National Bank'], ['BOB', 'Bank of Baroda'], ['CANB', 'Canara Bank'], ['UNIONB', 'Union Bank'],
  ['UBOI', 'Union Bank'], ['IOB', 'Indian Overseas Bank'], ['INDB', 'Indian Bank'], ['BOI', 'Bank of India'],
  ['CENTB', 'Central Bank'], ['IDFC', 'IDFC First Bank'], ['IDBI', 'IDBI Bank'], ['YESB', 'Yes Bank'],
  ['INDUS', 'IndusInd Bank'], ['FEDB', 'Federal Bank'], ['KVB', 'Karur Vysya Bank'], ['CUB', 'City Union Bank'],
  ['TMB', 'Tamilnad Mercantile Bank'], ['SIB', 'South Indian Bank'], ['AUB', 'AU Small Finance Bank'],
  ['RBL', 'RBL Bank'], ['BANDH', 'Bandhan Bank'], ['UCO', 'UCO Bank'], ['MAHAB', 'Bank of Maharashtra'],
  ['KTKB', 'Karnataka Bank'], ['JKB', 'J&K Bank'], ['DCB', 'DCB Bank'], ['IPB', 'India Post Payments Bank'],
  ['CSB', 'CSB Bank'], ['DHAN', 'Dhanlaxmi Bank'], ['EQUT', 'Equitas Bank'], ['UJJIV', 'Ujjivan Bank'],
  ['PAYTMB', 'Paytm Payments Bank'], ['AIRBNK', 'Airtel Payments Bank'],
].sort((a, b) => b[0].length - a[0].length) as [string, string][];

const PHONE = /^\+?[\d\s()-]{6,}$/;

export interface ParsedSender {
  /** Possible headers, most likely first ("JMTMBANK" → ["JMTMBANK", "TMBANK"]). */
  candidates: string[];
  category?: string;
}

/** Splits any displayed form of a DLT sender into header candidates + category letter. */
export function parseSender(raw: string): ParsedSender | undefined {
  const tokens = raw.trim().toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
  if (!tokens.length) return undefined;
  let category: string | undefined;
  if (tokens.length >= 2 && tokens[tokens.length - 1].length === 1) category = tokens.pop();
  if (tokens.length >= 2 && tokens[0].length === 2) tokens.shift(); // operator+circle prefix
  const joined = tokens.join('');
  if (joined.length < 3 || joined.length > 11 || !/[A-Z]/.test(joined)) return undefined;
  const candidates = [joined];
  // Undashed "JMTMBANK" = 2-char prefix + 6-char header.
  if (tokens.length === 1 && joined.length === 8) candidates.push(joined.slice(2));
  return {candidates, category};
}

export const normalizeHeader = (h: string) => h.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');

/** What to store when the user types a code: a full header ("TMBANK") or a bank stem ("TMB"). */
export function headerOf(raw: string): string | undefined {
  const p = parseSender(raw);
  if (!p) return undefined;
  return p.candidates[p.candidates.length - 1];
}

/** A trusted entry of 3–5 chars is a stem (matches every header starting with it); 6+ is exact. */
export const trustMatches = (rule: string, header: string) => {
  const r = normalizeHeader(rule);
  return r.length >= 6 ? header === r : header.startsWith(r);
};

const stemBank = (header: string) => BANK_STEMS.find(([stem]) => header.startsWith(stem))?.[1];

export interface SenderContext {
  /** The SMS text, used to check it's about one of the user's accounts. */
  body?: string;
  /** Last digits of the user's configured accounts. */
  accountDigits?: string[];
}

/** True when the message names one of the user's accounts, e.g. "A/c XX7003" or "a/c ending 7003". */
export function mentionsOwnAccount(body: string | undefined, digits: string[] = []) {
  if (!body) return false;
  return digits.some(d => d && d.length >= 3 && new RegExp(`(?:[x*#.]|a\\/c|acct|account|ending|no\\.?)\\s*[x*#.]*\\s*\\d*${d}\\b`, 'i').test(body));
}

export function classifySender(raw: string | undefined, trusted: string[] = [], ctx: SenderContext = {}): SenderClass {
  const s = (raw ?? '').trim();
  if (!s) return {kind: 'none'};
  if (PHONE.test(s)) return {kind: 'personal', raw: s};
  // Sender codes are always upper-case; "Ramesh" (a saved contact) is a person, not header RAMESH.
  if (/[a-z]/.test(s) && !/^[A-Za-z]{2}-/.test(s)) return {kind: 'personal', raw: s};

  const p = parseSender(s);
  if (!p) return {kind: 'personal', raw: s};
  const header = p.candidates[p.candidates.length - 1];
  if (p.category === 'P') return {kind: 'promotional', header};
  if (p.category === 'G') return {kind: 'government', header};

  for (const h of p.candidates) {
    if (trusted.some(rule => trustMatches(rule, h))) {
      return {kind: 'bank', header: h, bank: BANK_HEADERS[h] ?? stemBank(h) ?? h, via: 'trusted'};
    }
  }
  for (const h of p.candidates) {
    if (BANK_HEADERS[h]) return {kind: 'bank', header: h, bank: BANK_HEADERS[h], via: 'known'};
  }
  for (const h of p.candidates) {
    const bank = stemBank(h);
    if (bank) {
      // Two independent signals: the registered code names the bank AND the SMS is about your account.
      if (mentionsOwnAccount(ctx.body, ctx.accountDigits)) return {kind: 'bank', header: h, bank, via: 'account'};
      return {kind: 'business', header: h, likelyBank: bank};
    }
  }
  return {kind: 'business', header};
}

/** Human-readable reason for Diagnostics when an SMS is not treated as a bank alert. */
export function senderRejectReason(c: SenderClass): string | undefined {
  switch (c.kind) {
    case 'personal':
      return 'Personal SMS (phone number or contact), not a bank';
    case 'promotional':
      return `Promotional SMS (${c.header}-P)`;
    case 'government':
      return `Government SMS (${c.header}-G)`;
    case 'none':
      return 'SMS sender unknown';
    default:
      return undefined;
  }
}
