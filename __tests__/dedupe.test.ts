import {expect, test} from '@jest/globals';
import {checkDuplicate, Candidate} from '../src/engine/dedupe';
import type {Txn} from '../src/engine/types';

const T0 = 1_700_000_000_000;
const txn = (o: Partial<Txn>): Txn => ({
  id: Math.random().toString(), amount: 500, direction: 'credit', kind: 'payment', status: 'success', category: 'received',
  confidence: 'high', timestamp: T0, source: {id: 'gpay', name: 'GPay', category: 'upi'}, raw: {title: '', text: '', hash: 'h1'},
  announce: {status: 'announced', count: 1}, createdAt: T0, updatedAt: T0, ...o,
});
const cand = (o: Partial<Candidate>): Candidate => ({amount: 500, direction: 'credit', status: 'success', kind: 'payment', sourceId: 'gpay', timestamp: T0 + 1000, hash: 'h2', ...o});

test('exact repost is duplicate', () => {
  expect(checkDuplicate(cand({hash: 'h1'}), [txn({})]).type).toBe('duplicate');
});
test('same reference from another source is duplicate', () => {
  expect(checkDuplicate(cand({reference: '123456789', sourceId: 'sms'}), [txn({reference: '123456789'})]).type).toBe('duplicate');
});
test('different reference, same amount = new', () => {
  expect(checkDuplicate(cand({reference: '999999999'}), [txn({reference: '123456789'})]).type).toBe('new');
});
test('same sender, same app, no ref, a minute later = new (two payments)', () => {
  expect(checkDuplicate(cand({sender: 'Ramesh', timestamp: T0 + 60000}), [txn({sender: 'Ramesh'})]).type).toBe('new');
});
test('cross-source within window = duplicate', () => {
  expect(checkDuplicate(cand({sourceId: 'sms', timestamp: T0 + 20000}), [txn({})]).type).toBe('duplicate');
});
test('cross-source with different sender = new', () => {
  expect(checkDuplicate(cand({sourceId: 'sms', sender: 'Priya'}), [txn({sender: 'Ramesh'})]).type).toBe('new');
});
test('pending then success = update', () => {
  expect(checkDuplicate(cand({}), [txn({status: 'pending'})]).type).toBe('update');
});
test('success then late pending = duplicate', () => {
  expect(checkDuplicate(cand({status: 'pending'}), [txn({})]).type).toBe('duplicate');
});
test('refund with same ref as payment = new', () => {
  expect(checkDuplicate(cand({kind: 'refund', reference: '123456789'}), [txn({reference: '123456789'})]).type).toBe('new');
});
