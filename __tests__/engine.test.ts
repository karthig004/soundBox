import {expect, test} from '@jest/globals';
import {parseEvent} from '../src/engine/parser';
import {amountPhrase} from '../src/engine/numberWords';
import {renderTemplate} from '../src/engine/templates';
import type {RawEvent} from '../src/engine/types';

const ev = (pkg: string, title: string, text: string): RawEvent => ({id: 'x', pkg, title, text, postTime: 0});
const GPAY = 'com.google.android.apps.nbu.paisa.user';
const SMS = 'com.google.android.apps.messaging';

test('gpay paid you', () => {
  const p = parseEvent(ev(GPAY, 'Ramesh Kumar paid you ₹1,250.00', 'Paid to your Kotak Bank account'))!;
  expect(p.amount).toBe(1250);
  expect(p.direction).toBe('credit');
  expect(p.sender).toBe('Ramesh Kumar');
  expect(p.bank).toBe('Kotak Bank');
});

test('gpay title-as-sender', () => {
  const p = parseEvent(ev(GPAY, 'Suresh', '₹500 received'))!;
  expect(p.direction).toBe('credit');
  expect(p.sender).toBe('Suresh');
});

test('hdfc credit sms', () => {
  const p = parseEvent(ev(SMS, 'AX-HDFCBK', 'Money Received - INR 1,250.00 in your HDFC Bank A/c xx1234 on 01-01-24 by A/c linked to VPA ramesh@okaxis (UPI Ref No 412345678901). Avl bal: INR 52,300.00'))!;
  expect(p.amount).toBe(1250);
  expect(p.direction).toBe('credit');
  expect(p.last4).toBe('1234');
  expect(p.reference).toBe('412345678901');
  expect(p.upiId).toBe('ramesh@okaxis');
  expect(p.bank).toBe('HDFC Bank');
  expect(p.sender).toBeUndefined();
});

test('hdfc sent sms', () => {
  const p = parseEvent(ev(SMS, 'VM-HDFCBK', 'Sent Rs.500.00 From HDFC Bank A/C x1234 To RAMESH STORES On 01/01/24 Ref 412345678902 Not You? Call 18002586161'))!;
  expect(p.direction).toBe('debit');
  expect(p.amount).toBe(500);
  expect(p.beneficiary).toBe('Ramesh Stores');
  expect(p.reference).toBe('412345678902');
});

test('icici debit', () => {
  const p = parseEvent(ev(SMS, 'JD-ICICIB', 'ICICI Bank Acct XX123 debited for Rs 500.00 on 01-Jan-24; RAMESH credited. UPI:412312341234. Call 18002662 for dispute.'))!;
  expect(p.direction).toBe('debit');
  expect(p.beneficiary).toBe('Ramesh');
  expect(p.reference).toBe('412312341234');
  expect(p.last4).toBe('123');
});

test('sbi credit no currency symbol', () => {
  const p = parseEvent(ev(SMS, 'BZ-SBIINB', 'Dear SBI User, your A/c X1234-credited by Rs.750 on 01Jan24 transfer from RAJA K Ref No 412398765432 -SBI'))!;
  expect(p.direction).toBe('credit');
  expect(p.amount).toBe(750);
  expect(p.sender).toBe('Raja K');
  expect(p.bank).toBe('SBI');
});

test('sbi debited by', () => {
  const p = parseEvent(ev(SMS, 'AD-SBIUPI', 'Dear UPI user A/C X1234 debited by 500.0 on date 01Jan24 trf to RAMESH Refno 412345678999. If not u? call 1800111109. -SBI'))!;
  expect(p.direction).toBe('debit');
  expect(p.amount).toBe(500);
  expect(p.beneficiary).toBe('Ramesh');
});

test('phonepe received', () => {
  const p = parseEvent(ev('com.phonepe.app', 'Received ₹200 from ANITHA', 'Credited to your SBI account'))!;
  expect(p.direction).toBe('credit');
  expect(p.sender).toBe('Anitha');
});

test('pending + failed + refund', () => {
  expect(parseEvent(ev('com.phonepe.app', 'Payment pending', '₹300 to Kumar is pending'))!.status).toBe('pending');
  expect(parseEvent(ev('com.phonepe.app', 'Payment failed', 'Payment of ₹300 to Kumar failed'))!.status).toBe('failed');
  const r = parseEvent(ev('net.one97.paytm', 'Refund received', 'Refund of ₹99 credited from Swiggy'))!;
  expect(r.kind).toBe('refund');
  expect(r.direction).toBe('credit');
});

test('informational', () => {
  expect(parseEvent(ev(SMS, 'AX-HDFCBK', '123456 is your OTP for txn of Rs 500'))!.informational).toBe(true);
  expect(parseEvent(ev(GPAY, 'Kumar requested ₹200', 'Pay now'))!.informational).toBe(true);
});

test('number words', () => {
  expect(amountPhrase(1250, 'en')).toBe('One thousand two hundred and fifty rupees');
  expect(amountPhrase(1250, 'ta')).toBe('ரூபாய் ஆயிரத்து இருநூற்று ஐம்பது');
  expect(amountPhrase(500, 'ta')).toBe('ரூபாய் ஐநூறு');
  expect(amountPhrase(1000, 'ta')).toBe('ரூபாய் ஆயிரம்');
  expect(amountPhrase(150000, 'en')).toBe('One lakh fifty thousand rupees');
  expect(amountPhrase(1250, 'hi')).toBe('एक हज़ार दो सौ पचास रुपये');
  expect(amountPhrase(10.5, 'en')).toBe('Ten rupees and fifty paise');
});

test('templates drop missing segments', () => {
  expect(renderTemplate('{amount} received[ from {sender}].', {amount: 'X'})).toBe('X received.');
  expect(renderTemplate('{amount}[, {sender} அவர்களிடமிருந்து] பெறப்பட்டது.', {amount: 'ரூபாய் ஆயிரம்'})).toBe('ரூபாய் ஆயிரம் பெறப்பட்டது.');
});

test('name after VPA', () => {
  const p = parseEvent(ev(SMS, '5554', 'Rs.2,500.00 credited to your A/c XX123 by VPA kumar@oksbi KUMAR TRADERS (UPI Ref No 412377770002) -HDFC Bank'))!;
  expect(p.sender).toBe('Kumar Traders');
  expect(p.upiId).toBe('kumar@oksbi');
  expect(p.last4).toBe('123');
});
