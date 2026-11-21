import {expect, jest, test} from '@jest/globals';

jest.mock('react-native-mmkv', () => ({
  MMKV: class {
    m = new Map<string, string>();
    getString(k: string) { return this.m.get(k); }
    set(k: string, v: string) { this.m.set(k, v); }
    delete(k: string) { this.m.delete(k); }
  },
}));
const spoken: {text: string; language: string}[] = [];
jest.mock('../src/native/Soundbox', () => ({
  Soundbox: {
    playChime: async () => {},
    stopSpeaking: async () => {},
    // Tamil voice "not installed" — like the emulator / many fresh phones.
    speak: async (text: string, o: {language: string}) => {
      if (o.language === 'ta-IN') throw new Error('error:-7');
      spoken.push({text, language: o.language});
      return 'done';
    },
  },
}));

import {announceTxn, whenIdle} from '../src/engine/announcer';
import {useData} from '../src/store/data';
import {useSettings} from '../src/store/settings';
import type {Txn} from '../src/engine/types';

test('falls back to English when the Tamil voice cannot speak', async () => {
  useSettings.getState().set({language: 'ta', active: true});
  const t: Txn = {id: 't1', amount: 1250, direction: 'credit', kind: 'payment', status: 'success', category: 'received', confidence: 'high', sender: 'Ramesh', timestamp: Date.now(), source: {id: 'sms', name: 'SMS', category: 'sms'}, announce: {status: 'none', count: 0}, createdAt: 0, updatedAt: 0};
  useData.getState().addTxn(t);
  expect(announceTxn(t)).toBe(true);
  await whenIdle(5000);
  expect(spoken[0]).toEqual({text: 'One thousand two hundred and fifty rupees received from Ramesh.', language: 'en-IN'});
  const saved = useData.getState().txns.find(x => x.id === 't1')!;
  expect(saved.announce.status).toBe('announced');
  expect(saved.announce.lang).toBe('en');
  expect(saved.announce.reason).toContain('ta-IN voice unavailable');
});

test('pending payments are never announced', () => {
  const t: Txn = {id: 't2', amount: 99, direction: 'credit', kind: 'payment', status: 'pending', category: 'pending', confidence: 'high', timestamp: Date.now(), source: {id: 'sms', name: 'SMS', category: 'sms'}, announce: {status: 'none', count: 0}, createdAt: 0, updatedAt: 0};
  useData.getState().addTxn(t);
  expect(announceTxn(t)).toBe(false);
});
