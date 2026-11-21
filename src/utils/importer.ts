import * as XLSX from 'xlsx';
import type {BankAccount, Txn} from '../engine/types';
import {uid} from '../store/storage';
import {textHash} from '../engine/parser';

export interface ImportReport {
  accepted: Txn[];
  duplicates: number;
  rejected: {row: number; reason: string}[];
  columns: Record<string, string | undefined>;
}

const pick = (headers: string[], ...patterns: RegExp[]) => headers.find(h => patterns.some(p => p.test(h)));

const num = (v: unknown) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[₹,\s]|rs\.?|inr/gi, '').replace(/\((.*)\)/, '-$1');
  const n = parseFloat(s);
  return isFinite(n) ? n : NaN;
};

function parseDate(v: unknown, time?: unknown): number | undefined {
  if (typeof v === 'number') {
    // Excel serial date
    const ms = Math.round((v - 25569) * 86400000);
    return ms > 0 ? ms + new Date(ms).getTimezoneOffset() * 60000 : undefined;
  }
  const s = String(v ?? '').trim();
  if (!s) return undefined;
  let d: Date | undefined;
  const m = s.match(/^(\d{1,2})[\/\-. ](\d{1,2}|[A-Za-z]{3})[\/\-. ](\d{2,4})/);
  if (m) {
    const months = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
    const mo = /\d/.test(m[2]) ? parseInt(m[2], 10) - 1 : months.indexOf(m[2].toLowerCase());
    let y = parseInt(m[3], 10);
    if (y < 100) y += 2000;
    d = new Date(y, mo, parseInt(m[1], 10));
  } else {
    const iso = new Date(s);
    if (!isNaN(iso.getTime())) d = iso;
  }
  if (!d || isNaN(d.getTime())) return undefined;
  const t = String(time ?? '').match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i) ?? s.match(/(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i);
  if (t) {
    let h = parseInt(t[1], 10);
    if (t[3]?.toLowerCase() === 'pm' && h < 12) h += 12;
    if (t[3]?.toLowerCase() === 'am' && h === 12) h = 0;
    d.setHours(h, parseInt(t[2], 10));
  } else d.setHours(12, 0);
  return d.getTime();
}

/**
 * Parses a bank statement / transaction export (CSV). Understands the common shapes:
 * separate Debit/Credit (Withdrawal/Deposit) columns, or Amount + Dr/Cr type column.
 * Exported RubyAlert CSVs round-trip too.
 */
export function parseStatement(content: string, existing: Txn[], account?: BankAccount): ImportReport {
  const wb = XLSX.read(content, {type: 'string', raw: false});
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json<any[]>(sheet, {header: 1, raw: true, defval: ''});

  // Statements often have preamble lines; the header is the first row mentioning a date column.
  const headerIdx = grid.findIndex(r => r.some((c: any) => /date/i.test(String(c))) && r.filter((c: any) => String(c).trim()).length >= 3);
  const report: ImportReport = {accepted: [], duplicates: 0, rejected: [], columns: {}};
  if (headerIdx < 0) {
    report.rejected.push({row: 0, reason: 'Could not find a header row with a Date column'});
    return report;
  }
  const headers = grid[headerIdx].map((h: any) => String(h).trim());
  const col = {
    date: pick(headers, /^(txn |transaction |value )?date$/i, /date/i),
    time: pick(headers, /^time$/i),
    desc: pick(headers, /narration|description|particulars|remarks|details/i),
    debit: pick(headers, /withdrawal|debit(?! card)|^dr$/i),
    credit: pick(headers, /deposit|credit|^cr$/i),
    amount: pick(headers, /^amount/i),
    type: pick(headers, /transaction type|^type$|dr\/cr|cr\/dr/i),
    ref: pick(headers, /ref|utr|cheque|chq/i),
    party: pick(headers, /sender|beneficiary|party|name/i),
    bank: pick(headers, /^bank$/i),
  };
  report.columns = col;
  const idx = (h?: string) => (h ? headers.indexOf(h) : -1);

  const seen = new Set(existing.filter(t => t.raw?.hash).map(t => t.raw!.hash));
  const refs = new Set(existing.filter(t => t.reference).map(t => t.reference!));

  for (let r = headerIdx + 1; r < grid.length; r++) {
    const row = grid[r];
    if (!row || row.every((c: any) => String(c).trim() === '')) continue;
    const get = (h?: string) => (idx(h) >= 0 ? row[idx(h)] : '');
    const ts = parseDate(get(col.date), get(col.time));
    if (!ts) {
      report.rejected.push({row: r + 1, reason: 'Invalid or missing date'});
      continue;
    }
    let amount = NaN;
    let direction: 'credit' | 'debit' | undefined;
    const dr = num(get(col.debit)), cr = num(get(col.credit));
    if (col.debit && dr > 0) {
      amount = dr;
      direction = 'debit';
    } else if (col.credit && cr > 0) {
      amount = cr;
      direction = 'credit';
    } else if (col.amount) {
      amount = num(get(col.amount));
      const type = String(get(col.type)).toLowerCase();
      if (/cr|credit|refund|revers/.test(type)) direction = 'credit';
      else if (/dr|debit/.test(type)) direction = 'debit';
      else if (amount < 0) direction = 'debit';
      else direction = undefined;
      amount = Math.abs(amount);
    }
    if (!(amount > 0)) {
      report.rejected.push({row: r + 1, reason: 'No amount found'});
      continue;
    }
    if (!direction) {
      report.rejected.push({row: r + 1, reason: 'Credit/debit could not be determined'});
      continue;
    }
    const desc = String(get(col.desc) ?? '');
    const refRaw = String(get(col.ref) ?? '').trim() || desc.match(/\b\d{10,16}\b/)?.[0];
    const reference = refRaw && /\d{6,}/.test(refRaw) ? refRaw : undefined;
    const hash = textHash(`import|${ts}|${amount}|${direction}|${desc}|${reference ?? ''}`);
    if (seen.has(hash) || (reference && refs.has(reference))) {
      report.duplicates++;
      continue;
    }
    seen.add(hash);
    if (reference) refs.add(reference);
    const typeStr = String(get(col.type)).toLowerCase();
    const kind = /refund/.test(typeStr) || /refund/i.test(desc) ? 'refund' : /revers/.test(typeStr) ? 'reversal' : 'payment';
    const partyName = String(get(col.party) ?? '').trim() || undefined;
    const now = Date.now();
    report.accepted.push({
      id: uid(),
      amount,
      direction,
      kind,
      status: 'success',
      category: kind === 'refund' ? 'refund' : kind === 'reversal' ? 'reversal' : direction === 'credit' ? 'received' : 'sent',
      confidence: account ? 'high' : 'medium',
      bank: String(get(col.bank) ?? '').trim() || account?.bank,
      accountId: account?.id,
      last4: account?.last4,
      sender: direction === 'credit' ? partyName : undefined,
      beneficiary: direction === 'debit' ? partyName : undefined,
      reference,
      timestamp: ts,
      source: {id: 'import', name: 'Statement import', category: 'import'},
      raw: {title: 'Imported', text: desc, hash},
      announce: {status: 'none', count: 0, reason: 'Imported records are not announced'},
      notes: desc || undefined,
      createdAt: now,
      updatedAt: now,
    });
  }
  return report;
}
