import {expect, jest, test} from '@jest/globals';

jest.mock('react-native-mmkv', () => ({
  MMKV: class {
    m = new Map<string, string>();
    getString(k: string) { return this.m.get(k); }
    set(k: string, v: string) { this.m.set(k, v); }
    delete(k: string) { this.m.delete(k); }
  },
}));

import {matchAccount} from '../src/engine/processor';
import type {BankAccount} from '../src/engine/types';

const acc = (o: Partial<BankAccount>): BankAccount => ({id: Math.random().toString(), displayName: 'x', bank: 'HDFC Bank', type: 'savings', upiIds: [], sources: [], active: true, isDefault: false, color: 0, createdAt: 0, ...o});

test('last-4 match is strong', () => {
  const a = acc({last4: '1234'});
  const r = matchAccount({last4: '1234', bank: 'HDFC Bank', sourceId: 'sms'}, [a]);
  expect(r.account?.id).toBe(a.id);
  expect(r.strength).toBe('strong');
});
test('conflicting digits are never assigned, even if it is the only HDFC account', () => {
  const r = matchAccount({last4: '1234', bank: 'HDFC Bank', sourceId: 'sms'}, [acc({last4: '123'})]);
  expect(r.account).toBeUndefined();
  expect(r.reason).toContain('xx1234');
});
test('no digits in alert: only account of that bank is a medium match', () => {
  const a = acc({last4: '9999'});
  expect(matchAccount({bank: 'HDFC Bank', sourceId: 'sms'}, [a]).strength).toBe('bank');
});
test('no default-account fallback', () => {
  expect(matchAccount({sourceId: 'gpay'}, [acc({isDefault: true}), acc({bank: 'SBI'})]).account).toBeUndefined();
});
