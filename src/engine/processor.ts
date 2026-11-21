import {data} from '../store/data';
import {getSettings} from '../store/settings';
import {uid} from '../store/storage';
import {announceTxn} from './announcer';
import {checkDuplicate, mergeMissing} from './dedupe';
import {parseEvent, textHash} from './parser';
import {classifySender, normalizeHeader, senderRejectReason, trustMatches} from './senders';
import {shortBank, sourceForEvent} from './sources';
import type {BankAccount, Confidence, ParsedTxn, RawEvent, Txn, TxnCategory} from './types';

type Strength = 'strong' | 'linked' | 'bank' | 'none';

const bankKey = (b?: string) => shortBank(b).toLowerCase().split(' ')[0];

export function matchAccount(p: Pick<ParsedTxn, 'last4' | 'bank' | 'upiId' | 'sourceId'>, accounts: BankAccount[]) {
  const bankOk = (a: BankAccount) => !p.bank || !a.bank || bankKey(a.bank) === bankKey(p.bank);
  // An alert naming "xx1234" must never be pinned on an account ending in something else.
  const digitsOk = (a: BankAccount) => !p.last4 || !a.last4 || a.last4.endsWith(p.last4) || p.last4.endsWith(a.last4);

  if (p.last4) {
    const hits = accounts.filter(a => a.last4 && bankOk(a) && (a.last4.endsWith(p.last4!) || p.last4!.endsWith(a.last4)));
    if (hits.length === 1) return {account: hits[0], strength: 'strong' as Strength, reason: `account ending ${p.last4}`};
    if (hits.length > 1) return {strength: 'none' as Strength, reason: `several accounts end with ${p.last4}`};
  }
  if (p.upiId) {
    const hits = accounts.filter(a => a.upiIds.some(u => u.toLowerCase() === p.upiId));
    if (hits.length === 1) return {account: hits[0], strength: 'strong' as Strength, reason: `UPI ID ${p.upiId}`};
  }
  const linked = accounts.filter(a => a.sources.includes(p.sourceId) && bankOk(a) && digitsOk(a));
  if (linked.length === 1) return {account: linked[0], strength: 'linked' as Strength, reason: 'only account linked to this app'};
  if (p.bank) {
    const same = accounts.filter(a => bankKey(a.bank) === bankKey(p.bank) && digitsOk(a));
    if (same.length === 1) return {account: same[0], strength: 'bank' as Strength, reason: `only ${p.bank} account`};
  }
  // Never fall back to the default account for an uncertain match (PRD 7.3).
  if (p.last4 && accounts.length) return {strength: 'none' as Strength, reason: `alert is for account xx${p.last4}, which isn't one of your accounts`};
  return {strength: 'none' as Strength, reason: accounts.length ? 'account could not be identified' : 'no accounts configured'};
}

function confidenceOf(p: ParsedTxn, strength: Strength, knownSource: boolean): Confidence {
  if (!p.amount || !p.direction) return 'low';
  if (!knownSource) return 'medium';
  if ((strength === 'strong' || strength === 'linked') && (p.reference || p.bank)) return 'high';
  return 'medium';
}

function categoryOf(p: ParsedTxn): TxnCategory {
  if (!p.amount || !p.direction) return 'unknown';
  if (p.status === 'failed') return 'failed';
  if (p.status === 'pending') return 'pending';
  if (p.kind === 'refund') return 'refund';
  if (p.kind === 'reversal') return 'reversal';
  return p.direction === 'credit' ? 'received' : 'sent';
}

const newTxnListeners = new Set<(t: Txn) => void>();
export const onNewTxn = (cb: (t: Txn) => void) => {
  newTxnListeners.add(cb);
  return () => {
    newTxnListeners.delete(cb);
  };
};

const evidence = (p: ParsedTxn, accountId?: string): Partial<Txn> => ({
  reference: p.reference,
  sender: p.sender,
  beneficiary: p.beneficiary,
  upiId: p.upiId,
  bank: p.bank,
  last4: p.last4,
  accountId,
});

export interface ProcessResult {
  decision: 'new' | 'duplicate' | 'updated' | 'informational' | 'unparsed' | 'ignored-source' | 'ignored-sender';
  txn?: Txn;
  detail?: string;
}

export function processEvent(ev: RawEvent): ProcessResult {
  const s = getSettings();
  const d = data();
  const def = sourceForEvent(ev);
  const snippet = `${ev.title} — ${ev.bigText || ev.text}`.slice(0, 280);
  const logBase = {pkg: ev.pkg, title: ev.title, snippet};

  if (def && s.sources[def.id] === false && (ev.origin === 'notification' || ev.origin === 'sms')) {
    d.log({...logBase, decision: 'ignored-source', detail: `${def.name} is disabled`});
    return {decision: 'ignored-source'};
  }
  if (!def && ev.origin === 'notification' && !s.captureUnknownApps) {
    d.log({...logBase, decision: 'ignored-source', detail: 'App is not a supported source'});
    return {decision: 'ignored-source'};
  }

  // SMS: only bank sender codes count. Decided from who sent it, never from the text.
  let sms: Pick<Txn, 'smsSender' | 'senderTrust'> & {bank?: string; likelyBank?: string} = {};
  if (def?.id === 'sms' && ev.origin !== 'share') {
    const raw = ev.sender ?? (ev.personUri?.startsWith('tel:') ? ev.personUri.slice(4) : undefined) ?? ev.title;
    const sc = classifySender(raw, s.trustedSenders, {
      body: `${ev.bigText || ev.text} ${ev.subText ?? ''}`,
      accountDigits: d.accounts.filter(a => a.active).map(a => a.last4 ?? '').filter(Boolean),
    });
    const reject = senderRejectReason(sc);
    if (reject) {
      // Personal messages: keep only who sent it, never the content.
      const snip = sc.kind === 'personal' ? `From ${sc.raw}` : snippet;
      d.log({pkg: ev.pkg, title: ev.title, snippet: snip, decision: 'ignored-sender', detail: reject});
      return {decision: 'ignored-sender', detail: reject};
    }
    if (sc.kind === 'bank') {
      sms = {smsSender: sc.header, senderTrust: sc.via === 'trusted' ? 'trusted' : 'bank', bank: sc.bank};
      // Bank-looking code + SMS about the user's own account: remember the code so later
      // SMS from it (even without account digits) are recognised too.
      if (sc.via === 'account') {
        trustSender(sc.header);
        d.log({pkg: ev.pkg, title: ev.title, snippet: `Learned ${sc.header} as ${sc.bank}`, decision: 'new', detail: 'Bank code + your account number in the SMS'});
      }
    } else {
      sms = {smsSender: sc.kind === 'business' ? sc.header : undefined, senderTrust: 'unverified', likelyBank: sc.kind === 'business' ? sc.likelyBank : undefined};
    }
  }

  const parsed = parseEvent(ev);
  // The bank behind a verified sender code beats whatever bank name the text mentions.
  const p = parsed && sms.bank ? {...parsed, bank: sms.bank} : parsed;
  if (!p) {
    d.log({...logBase, decision: 'unparsed', detail: 'No amount or transaction keywords'});
    return {decision: 'unparsed'};
  }
  if (p.informational) {
    d.log({...logBase, decision: 'informational', detail: p.infoReason});
    return {decision: 'informational', detail: p.infoReason};
  }

  const match = matchAccount(p, d.accounts);
  const hash = textHash(`${ev.pkg}|${ev.title}|${ev.bigText || ev.text}`);
  const timestamp = ev.postTime || Date.now();

  const dup = checkDuplicate(
    {
      amount: p.amount,
      direction: p.direction,
      status: p.status,
      kind: p.kind,
      reference: p.reference,
      sender: p.sender,
      beneficiary: p.beneficiary,
      accountId: match.account?.id,
      sourceId: p.sourceId,
      timestamp,
      hash,
      key: ev.key,
    },
    d.txns,
  );

  if (dup.type === 'duplicate') {
    const enrich = mergeMissing(dup.existing, evidence(p, match.account?.id));
    d.updateTxn(dup.existing.id, {...enrich, mergedEvents: (dup.existing.mergedEvents ?? 0) + 1});
    d.log({...logBase, decision: 'duplicate', detail: dup.reason, txnId: dup.existing.id});
    return {decision: 'duplicate', txn: dup.existing, detail: dup.reason};
  }

  if (dup.type === 'update') {
    const prev = dup.existing;
    const patch: Partial<Txn> = {
      ...mergeMissing(prev, evidence(p, match.account?.id)),
      status: p.status,
      category: categoryOf(p),
      confidence: confidenceOf(p, match.strength, !!def || ev.origin !== 'notification'),
      mergedEvents: (prev.mergedEvents ?? 0) + 1,
    };
    d.updateTxn(prev.id, patch);
    d.log({...logBase, decision: 'updated', detail: dup.reason, txnId: prev.id});
    const updated = data().txns.find(t => t.id === prev.id)!;
    // A pending payment that just succeeded is announced now — exactly once.
    if (updated.status === 'success' && updated.announce.status !== 'announced') announceTxn(updated);
    return {decision: 'updated', txn: updated, detail: dup.reason};
  }

  const category = categoryOf(p);
  const confidence = confidenceOf(p, match.strength, !!def || ev.origin !== 'notification');
  const reasons: string[] = [];
  if (category === 'unknown') reasons.push(...p.notes);
  if (!match.account && d.accounts.length) reasons.push(match.reason);
  const unverifiedSender = sms.senderTrust === 'unverified';
  if (unverifiedSender) {
    reasons.push(sms.likelyBank
      ? `Looks like ${sms.likelyBank} (code ${sms.smsSender}) but the SMS doesn't mention your account — trust it if it's your bank`
      : `SMS sender ${sms.smsSender ?? ev.title} isn't a recognised bank — trust it to count and announce`);
  }

  const now = Date.now();
  const txn: Txn = {
    id: uid(),
    amount: p.amount,
    direction: p.direction ?? 'unknown',
    kind: p.kind,
    status: p.status,
    category,
    confidence,
    bank: p.bank ?? match.account?.bank,
    accountId: match.account?.id,
    last4: p.last4,
    sender: p.sender,
    beneficiary: p.beneficiary,
    upiId: p.upiId,
    reference: p.reference,
    timestamp,
    source: {id: p.sourceId, name: p.sourceName, category: p.sourceCategory, pkg: ev.pkg},
    unknownReason: reasons.length ? reasons.join('; ') : undefined,
    raw: {title: ev.title, text: ev.bigText || ev.text, hash, key: ev.key},
    announce: {status: 'none', count: 0},
    smsSender: sms.smsSender,
    senderTrust: sms.senderTrust,
    // Unverified senders are kept for review but don't count toward totals until trusted.
    review: unverifiedSender || undefined,
    excluded: unverifiedSender || undefined,
    createdAt: now,
    updatedAt: now,
  };
  d.addTxn(txn);
  d.log({...logBase, decision: 'new', detail: `${category} · ${confidence} · ${match.reason}`, txnId: txn.id});
  newTxnListeners.forEach(cb => cb(txn));
  announceTxn(txn);
  return {decision: 'new', txn};
}

let chain: Promise<unknown> = Promise.resolve();

/** Serialises processing so dedup always sees previously stored events. */
export function processEvents(events: RawEvent[]) {
  chain = chain.then(() => {
    for (const ev of events) {
      try {
        processEvent(ev);
      } catch (e: any) {
        data().log({pkg: ev.pkg, title: ev.title, snippet: String(e?.message ?? e), decision: 'unparsed', detail: 'processing error'});
      }
    }
  });
  return chain;
}

/** Creates a manually-entered transaction (PRD 17). Never treated as a live notification. */
export function addManualTxn(input: {
  amount: number;
  direction: 'credit' | 'debit';
  kind?: Txn['kind'];
  party?: string;
  accountId?: string;
  reference?: string;
  timestamp?: number;
  notes?: string;
  category?: string;
  announce?: boolean;
}) {
  const acc = data().accounts.find(a => a.id === input.accountId);
  const now = Date.now();
  const kind = input.kind ?? 'payment';
  const txn: Txn = {
    id: uid(),
    amount: input.amount,
    direction: input.direction,
    kind,
    status: 'success',
    category: kind === 'refund' ? 'refund' : kind === 'reversal' ? 'reversal' : input.direction === 'credit' ? 'received' : 'sent',
    confidence: 'high',
    bank: acc?.bank,
    accountId: acc?.id,
    last4: acc?.last4,
    sender: input.direction === 'credit' ? input.party : undefined,
    beneficiary: input.direction === 'debit' ? input.party : undefined,
    reference: input.reference,
    timestamp: input.timestamp ?? now,
    source: {id: 'manual', name: 'Manual entry', category: 'manual'},
    announce: {status: 'none', count: 0},
    notes: input.notes,
    userCategory: input.category,
    createdAt: now,
    updatedAt: now,
  };
  data().addTxn(txn);
  if (input.announce) announceTxn(txn, true);
  return txn;
}

/**
 * Marks an SMS sender code as the user's bank: future SMS from it are announced, and transactions
 * already held for review from it start counting (they are not announced retroactively).
 */
export function trustSender(header: string) {
  const s = getSettings();
  const h = normalizeHeader(header);
  if (h.length < 3) return;
  if (!s.trustedSenders.includes(h)) s.set({trustedSenders: [...s.trustedSenders, h]});
  // A stem like "TMB" also promotes held SMS from TMBANK, TMBSMS, …
  data()
    .txns.filter(t => t.smsSender && trustMatches(h, t.smsSender) && t.senderTrust === 'unverified')
    .forEach(t => data().updateTxn(t.id, {senderTrust: 'trusted', review: false, excluded: false, unknownReason: undefined}));
}

export function untrustSender(header: string) {
  const s = getSettings();
  s.set({trustedSenders: s.trustedSenders.filter(x => x !== normalizeHeader(header))});
}
