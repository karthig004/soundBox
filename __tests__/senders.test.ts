import {expect, test} from '@jest/globals';
import {classifySender, headerOf, mentionsOwnAccount, trustMatches} from '../src/engine/senders';

test.each([
  ['JM-HDFCBK-S', 'HDFC Bank'],
  ['VM-SBIINB-T', 'SBI'],
  ['AD-ICICIT', 'ICICI Bank'],
  ['HDFCBK', 'HDFC Bank'],
  // Same TMB header, different operator/circle prefix and ending every time:
  ['JM-TMBANK-S', 'Tamilnad Mercantile Bank'],
  ['SL-TMBANK', 'Tamilnad Mercantile Bank'],
  ['AD-TMBANK-T', 'Tamilnad Mercantile Bank'],
  ['JMTMBANK', 'Tamilnad Mercantile Bank'], // shown without dashes
  ['TMBANK', 'Tamilnad Mercantile Bank'],
])('%s is a known bank', (raw, bank) => {
  expect(classifySender(raw)).toMatchObject({kind: 'bank', bank, via: 'known'});
});

test.each([
  ['+91 98765 43210', 'personal'],
  ['9876543210', 'personal'],
  ['5554', 'personal'],
  ['Amma', 'personal'],
  ['Ramesh', 'personal'], // a contact, not header RAMESH
  ['HDFC Bank', 'personal'], // a name, can't be verified
  ['JM-HDFCBK-P', 'promotional'],
  ['VK-GOVTIN-G', 'government'],
  ['JM-SWIGGY-S', 'business'],
])('%s is %s', (raw, kind) => {
  expect(classifySender(raw).kind).toBe(kind);
});

test('unknown TMB header: looks like TMB, confirmed only when the SMS is about your account', () => {
  const body = 'Rs.500.00 credited to your A/c XX7003 on 30-10-26 by UPI';
  expect(classifySender('SL-TMBSMS-S')).toMatchObject({kind: 'business', likelyBank: 'Tamilnad Mercantile Bank'});
  expect(classifySender('SL-TMBSMS-S', [], {body, accountDigits: ['7003']})).toMatchObject({kind: 'bank', via: 'account', bank: 'Tamilnad Mercantile Bank'});
  expect(classifySender('SL-TMBSMS-S', [], {body, accountDigits: ['1234']}).kind).toBe('business');
  // A non-bank business never auto-verifies, even when it mentions your account.
  expect(classifySender('JM-SWIGGY-S', [], {body, accountDigits: ['7003']}).kind).toBe('business');
});

test('trusting a stem ("TMB") covers every TMB header', () => {
  expect(classifySender('SL-TMBXYZ-T', ['TMB'])).toMatchObject({kind: 'bank', via: 'trusted', bank: 'Tamilnad Mercantile Bank'});
  expect(classifySender('AX-ABCBNK-S', ['ABCBNK'])).toMatchObject({kind: 'bank', via: 'trusted'});
  expect(trustMatches('TMB', 'TMBANK')).toBe(true);
  expect(trustMatches('TMBANK', 'TMBSMS')).toBe(false);
});

test('headerOf: what to store from what the user types', () => {
  expect(headerOf('jm-tmbank-s')).toBe('TMBANK');
  expect(headerOf('TMB')).toBe('TMB');
  expect(headerOf('JMTMBANK')).toBe('TMBANK');
  expect(headerOf('9876543210')).toBeUndefined();
});

test('mentionsOwnAccount', () => {
  expect(mentionsOwnAccount('credited to HDFC Bank A/c XX7003 on', ['7003'])).toBe(true);
  expect(mentionsOwnAccount('Acct XX123 debited', ['123'])).toBe(true);
  expect(mentionsOwnAccount('your a/c ending 7003', ['7003'])).toBe(true);
  expect(mentionsOwnAccount('Order 47003 delivered', ['7003'])).toBe(false);
});
