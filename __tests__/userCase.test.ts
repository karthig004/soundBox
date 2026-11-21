import {beforeAll, beforeEach, expect, jest, test} from '@jest/globals';

jest.mock('react-native-mmkv', () => ({
  MMKV: class {
    m = new Map<string, string>();
    getString(k: string) { return this.m.get(k); }
    set(k: string, v: string) { this.m.set(k, v); }
    delete(k: string) { this.m.delete(k); }
  },
}));
const spoken: string[] = [];
jest.mock('../src/native/Soundbox', () => ({
  Soundbox: {playChime: async () => {}, stopSpeaking: async () => {}, speak: async (t: string) => { spoken.push(t); return 'done'; }},
}));

import {whenIdle} from '../src/engine/announcer';
import {processEvent, trustSender} from '../src/engine/processor';
import {useData} from '../src/store/data';
import {useSettings} from '../src/store/settings';

// The exact alert a user reported as "not read".
const BODY = 'Credit Alert!\nRs.1.00 credited to HDFC Bank A/c XX7003 on 30-10-26 from VPA *ch46@okaxis (UPI 666962708837)';
const MSG = 'com.google.android.apps.messaging';

beforeAll(() => {
  useSettings.getState().set({captureUnknownApps: false, language: 'en', active: true});
  useData.getState().upsertAccount({displayName: 'Personal', bank: 'HDFC Bank', last4: '7003'});
});
beforeEach(() => {
  useData.getState().clearTxns();
  spoken.length = 0;
});

const sms = (sender: string, text = BODY) =>
  processEvent({id: String(Math.random()), pkg: 'sms', title: sender, sender, text, postTime: Date.now(), origin: 'sms'});

test('bank sender code (verified SMS) → recognised, matched, announced', async () => {
  const r = sms('JM-HDFCBK-S');
  expect(r.decision).toBe('new');
  expect(r.txn).toMatchObject({amount: 1, direction: 'credit', confidence: 'high', reference: '666962708837', smsSender: 'HDFCBK', senderTrust: 'bank'});
  expect(r.txn?.accountId).toBeDefined();
  await whenIdle(3000);
  expect(spoken).toHaveLength(1);
});

test('same text from a personal number → ignored, nothing stored or spoken', async () => {
  const r = sms('+919876543210');
  expect(r.decision).toBe('ignored-sender');
  expect(useData.getState().txns).toHaveLength(0);
  // Personal SMS content is never written to the diagnostics log.
  expect(useData.getState().diag[0].snippet).toBe('From +919876543210');
  await whenIdle(500);
  expect(spoken).toHaveLength(0);
});

test('promotional -P sender → ignored', () => {
  expect(sms('JM-HDFCBK-P').decision).toBe('ignored-sender');
});

test('unknown business code → held for review, silent, not counted; trusting it fixes that', async () => {
  const r = sms('AX-ABCBNK-S');
  expect(r.decision).toBe('new');
  expect(r.txn).toMatchObject({senderTrust: 'unverified', review: true, excluded: true});
  await whenIdle(500);
  expect(spoken).toHaveLength(0);
  trustSender('ABCBNK');
  expect(useData.getState().txns[0]).toMatchObject({senderTrust: 'trusted', excluded: false, review: false});
  // Next SMS from it is announced.
  sms('AX-ABCBNK-S', BODY.replace('666962708837', '666962708899'));
  await whenIdle(3000);
  expect(spoken).toHaveLength(1);
});

test('notification fallback: contact name or tel: sender is personal, sender code is bank', () => {
  const n = (title: string, personUri?: string) =>
    processEvent({id: String(Math.random()), pkg: MSG, title, text: BODY, postTime: Date.now(), origin: 'notification', defaultSms: true, personUri});
  expect(n('Ramesh').decision).toBe('ignored-sender');
  expect(n('HDFCBK', 'tel:+919876543210').decision).toBe('ignored-sender'); // contact saved as "HDFCBK"
  useData.getState().clearTxns();
  expect(n('JM-HDFCBK-S').decision).toBe('new');
});

test('unknown header of your bank + your account number → announced and the code is learned', async () => {
  const r = sms('SL-HDFCXY-S', BODY.replace('666962708837', '666962700001'));
  expect(r.txn).toMatchObject({senderTrust: 'bank', smsSender: 'HDFCXY'});
  await whenIdle(3000);
  expect(spoken).toHaveLength(1);
  expect(useSettings.getState().trustedSenders).toContain('HDFCXY');
  // Later SMS from that code without account digits still count.
  const r2 = sms('JM-HDFCXY', 'Rs.20.00 credited by UPI Ref No 412399990077');
  expect(r2.txn?.senderTrust).toBe('trusted');
});
