import * as XLSX from 'xlsx';
import {Soundbox} from '../native/Soundbox';
import type {BankAccount, Txn} from '../engine/types';
import {byDay, countsInTotals, effDirection, groupBy, party, summarize} from './stats';
import {dayKey, fmtDate, fmtTime} from './format';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const CSV_MIME = 'text/csv';

const typeLabel = (t: Txn) =>
  t.kind === 'refund' ? 'Refund' : t.kind === 'reversal' ? 'Reversal' : effDirection(t) === 'credit' ? 'Credit' : effDirection(t) === 'debit' ? 'Debit' : 'Unknown';

function accountLabel(t: Txn, accounts: BankAccount[]) {
  const a = accounts.find(x => x.id === t.accountId);
  if (a) return `${a.displayName}${a.last4 ? ` (xx${a.last4})` : ''}`;
  return t.last4 ? `xx${t.last4}` : 'Unassigned';
}

function txnRow(t: Txn, accounts: BankAccount[]) {
  const dir = effDirection(t);
  return {
    Date: fmtDate(t.timestamp),
    Time: fmtTime(t.timestamp),
    Bank: t.bank ?? '',
    Account: accountLabel(t, accounts),
    'Transaction type': typeLabel(t),
    Amount: t.amount,
    Sender: dir === 'credit' ? party(t) ?? '' : '',
    Beneficiary: dir === 'debit' ? party(t) ?? '' : '',
    'Reference number': t.reference ?? '',
    Source: t.source.name,
    Status: t.status,
    'Announcement status': t.announce.status,
    Category: t.userCategory ?? '',
    Notes: t.notes ?? '',
    'Edited by user': t.corrections ? 'Yes' : '',
  };
}

export interface ExportInput {
  txns: Txn[];
  accounts: BankAccount[];
  from: number;
  to: number;
  label: string;
  businessName?: string;
}

function workbook({txns, accounts, from, to, label, businessName}: ExportInput) {
  const included = txns.filter(t => !t.irrelevant);
  const s = summarize(included);
  const wb = XLSX.utils.book_new();

  const summary = [
    ['RubyAlert report', businessName ?? ''],
    ['Reporting period', label],
    ['From', fmtDate(from)],
    ['To', fmtDate(Math.min(to, Date.now()))],
    [],
    ['Total credit', s.received],
    ['Total debit', s.sent],
    ['Total refunds', s.refunds],
    ['Net movement', s.net],
    ['Total transactions', s.count],
    ['Credit transactions', s.creditCount],
    ['Debit transactions', s.debitCount],
    ['Unknown transactions', s.unknown],
    ['Pending / failed notifications', s.pending + s.failed],
    [],
    ['Note', 'Built from notifications recorded on this device. Not a bank statement and not an account balance.'],
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(summary);
  ws1['!cols'] = [{wch: 30}, {wch: 60}];
  XLSX.utils.book_append_sheet(wb, ws1, 'Summary');

  const rows = included.slice().sort((a, b) => a.timestamp - b.timestamp).map(t => txnRow(t, accounts));
  const ws2 = XLSX.utils.json_to_sheet(rows);
  ws2['!cols'] = [10, 9, 16, 22, 14, 12, 22, 22, 18, 16, 10, 14, 16, 24, 8].map(wch => ({wch}));
  XLSX.utils.book_append_sheet(wb, ws2, 'Transactions');

  const days = byDay(included, from, Math.min(to, Date.now())).map(d => ({
    Date: fmtDate(d.ts),
    'Total credit': d.received,
    'Total debit': d.sent,
    Refunds: d.refunds,
    'Net movement': d.net,
    'Transaction count': d.count,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(days), 'Daily Summary');

  const banks = groupBy(included, t => ({key: `${t.bank ?? '?'}|${t.accountId ?? ''}`, label: t.bank ?? 'Unknown bank', sub: accountLabel(t, accounts)})).map(g => ({
    Bank: g.label,
    Account: g.sub,
    'Total credit': g.received,
    'Total debit': g.sent,
    'Transaction count': g.count,
  }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(banks), 'Bank Summary');

  const unknown = included
    .filter(t => t.category === 'unknown' || !t.accountId || !countsInTotals(t))
    .map(t => ({
      Date: fmtDate(t.timestamp),
      Time: fmtTime(t.timestamp),
      Amount: t.amount || '',
      Source: t.source.name,
      'Available information': [t.bank, t.last4 && `xx${t.last4}`, party(t), t.reference].filter(Boolean).join(' · ') || (t.raw?.text ?? '').slice(0, 120),
      'Reason for unidentified status': t.unknownReason ?? (t.status !== 'success' ? `Status: ${t.status}` : !t.accountId ? 'Account not identified' : ''),
    }));
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(unknown.length ? unknown : [{Info: 'No unknown transactions'}]), 'Unknown Transactions');
  return wb;
}

const fileStamp = (from: number, to: number) => (dayKey(from) === dayKey(to) ? dayKey(from) : `${dayKey(from)}_to_${dayKey(to)}`);

export async function exportXlsx(input: ExportInput, share = true) {
  const wb = workbook(input);
  const b64 = XLSX.write(wb, {type: 'base64', bookType: 'xlsx'});
  const name = `RubyAlert_${fileStamp(input.from, Math.min(input.to, Date.now()))}.xlsx`;
  const res = await Soundbox.saveFile(b64, name, XLSX_MIME);
  if (share) await Soundbox.shareFile(res.uri, XLSX_MIME, 'Share report');
  return {...res, name};
}

export async function exportCsv(input: ExportInput, share = true) {
  const rows = input.txns.filter(t => !t.irrelevant).sort((a, b) => a.timestamp - b.timestamp).map(t => txnRow(t, input.accounts));
  const ws = XLSX.utils.json_to_sheet(rows);
  // BOM so Excel opens Tamil/Hindi names correctly.
  const csv = '﻿' + XLSX.utils.sheet_to_csv(ws);
  const name = `RubyAlert_${fileStamp(input.from, Math.min(input.to, Date.now()))}.csv`;
  const res = await Soundbox.saveFile(utf8ToBase64(csv), name, CSV_MIME);
  if (share) await Soundbox.shareFile(res.uri, CSV_MIME, 'Share CSV');
  return {...res, name};
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

export function utf8ToBase64(str: string) {
  const bytes: number[] = [];
  for (let i = 0; i < str.length; i++) {
    let c = str.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff && i + 1 < str.length) {
      c = 0x10000 + ((c - 0xd800) << 10) + (str.charCodeAt(++i) - 0xdc00);
    }
    if (c < 0x80) bytes.push(c);
    else if (c < 0x800) bytes.push(0xc0 | (c >> 6), 0x80 | (c & 63));
    else if (c < 0x10000) bytes.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
    else bytes.push(0xf0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
  }
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const [a, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | (b << 8) | c;
    out += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '=') + (i + 2 < bytes.length ? B64[n & 63] : '=');
  }
  return out;
}
