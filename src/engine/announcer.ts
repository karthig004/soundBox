import {create} from 'zustand';
import {Soundbox} from '../native/Soundbox';
import {data} from '../store/data';
import {getSettings, inQuietHours, Settings} from '../store/settings';
import {langTag, PERSONAS} from '../voice/presets';
import {planClips} from '../voice/clips';
import {buildAnnouncement, LOW_CONFIDENCE_TEXT} from './templates';
import type {Lang, Txn} from './types';

interface Item {
  txnId?: string;
  text: string;
  lang: Lang;
  /** English rendering: spoken if the chosen language can't be, and as the optional translation. */
  fallbackText?: string;
  /** Same announcement without sender/bank names — always coverable by bundled clips. */
  bareText?: string;
  priority: number;
}

interface AnnouncerState {
  speaking: boolean;
  current?: string;
  queued: number;
}

export const useAnnouncer = create<AnnouncerState>(() => ({speaking: false, queued: 0}));

const queue: Item[] = [];
let running = false;
let idleWaiters: (() => void)[] = [];

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

export function voiceOptions(s: Settings, lang: Lang, override?: Partial<Settings['voice']>) {
  const v = {...s.voice, ...override};
  return {
    language: langTag(lang),
    voice: v.voiceByLang?.[lang] ?? null,
    pitch: v.pitch,
    rate: v.rate,
    volume: v.volume / 100,
    boostTo: v.boost ? v.boostLevel / 100 : null,
    duck: v.duck,
    engine: v.engine,
  };
}

/** Why a recorded transaction should not be spoken, or null when it should. */
export function skipReason(t: Txn, s: Settings): string | null {
  if (!s.active) return 'Soundbox is switched off';
  if (s.pausedUntil > Date.now()) return 'Announcements paused';
  if (inQuietHours(s)) return 'Quiet hours';
  if (t.status === 'pending') return 'Pending transactions are not announced as successful';
  if (t.status === 'failed') return 'Failed transaction';
  if (t.category === 'unknown') return 'Transaction could not be identified';
  // Bank SMS only: a message whose sender code isn't a known or trusted bank never makes a sound.
  if (t.source.category === 'sms' && t.senderTrust === 'unverified') return 'SMS sender is not a verified bank';
  if (t.confidence === 'low' && !s.announce.lowConfidence) return 'Low recognition confidence';
  if (t.amount < s.announce.minAmount) return `Below minimum amount ₹${s.announce.minAmount}`;
  const acc = t.accountId ? data().accounts.find(a => a.id === t.accountId) : undefined;
  if (acc && !acc.active) return `Account "${acc.displayName}" is inactive`;
  if (!t.accountId && data().accounts.length > 0 && !s.announce.unassigned) return 'Account not identified';
  if (t.kind === 'refund' && !s.announce.refund) return 'Refund announcements disabled';
  if (t.kind === 'reversal' && !s.announce.reversal) return 'Reversal announcements disabled';
  if (t.kind === 'payment' && t.direction === 'credit' && !s.announce.credit) return 'Credit announcements disabled';
  if (t.kind === 'payment' && t.direction === 'debit' && !s.announce.debit) return 'Debit announcements disabled';
  return null;
}

export function announcementText(t: Txn, s: Settings, lang = s.language) {
  if (t.confidence === 'low') return LOW_CONFIDENCE_TEXT[lang];
  const acc = t.accountId ? data().accounts.find(a => a.id === t.accountId) : undefined;
  return buildAnnouncement(t, {
    lang,
    style: s.announce.style,
    amountMode: s.announce.amountMode,
    includeSender: s.announce.includeSender,
    includeBank: s.announce.includeBank,
    custom: s.announce.custom,
    businessName: s.mode === 'business' ? s.businessName : undefined,
    accountName: acc?.displayName,
  });
}

/** Queues a transaction; returns false (and records why) when it must not be spoken. */
export function announceTxn(t: Txn, force = false): boolean {
  const s = getSettings();
  const reason = force ? null : skipReason(t, s);
  if (t.announce.status === 'announced' && !force) return false;
  if (reason) {
    data().updateTxn(t.id, {announce: {...t.announce, status: 'skipped', reason}});
    data().log({pkg: t.source.pkg ?? t.source.id, title: 'Announcement skipped', snippet: reason, decision: 'announce-skipped', txnId: t.id});
    return false;
  }
  const text = announcementText(t, s);
  const fallbackText = s.language !== 'en' ? announcementText(t, s, 'en') : undefined;
  const bareText = announcementText(t, {...s, announce: {...s.announce, includeSender: false, includeBank: false}});
  data().updateTxn(t.id, {announce: {...t.announce, status: 'queued', text, textEn: fallbackText, lang: s.language}});
  enqueue({txnId: t.id, text, lang: s.language, fallbackText, bareText, priority: t.direction === 'credit' ? 2 : 1});
  return true;
}

function enqueue(item: Item) {
  // Incoming payments jump ahead of debits (PRD 11.4) but keep FIFO among equals.
  const idx = queue.findIndex(q => q.priority < item.priority);
  if (idx < 0) queue.push(item);
  else queue.splice(idx, 0, item);
  useAnnouncer.setState({queued: queue.length});
  if (!running) void loop();
}

async function clips(text: string | undefined, lang: Lang, o: ReturnType<typeof voiceOptions>) {
  const plan = text ? planClips(text, lang) : null;
  if (!plan) throw new Error('no-clips');
  await Soundbox.playClips(plan, o);
}

/**
 * Speaks one sentence. Bundled clips need no device voice (so Tamil works on every phone and iPhone);
 * the device voice is only needed for words we have no recording of, such as a sender's name.
 */
export async function speakText(text: string, lang: Lang, s: Settings, bareText?: string, override?: Partial<Settings['voice']>) {
  const o = voiceOptions(s, lang, override);
  const source = {...s.voice, ...override}.source ?? 'auto';
  if (source === 'device') {
    try {
      return await Soundbox.speak(text, o);
    } catch (e) {
      return await clips(text, lang, o).catch(() => clips(bareText, lang, o)).catch(() => Promise.reject(e));
    }
  }
  if (planClips(text, lang)) {
    try {
      return await clips(text, lang, o);
    } catch {
      // A matched clip plan can still fail at runtime (for example, on an incomplete install).
      // Fall back to device speech so auto and built-in modes do not silently drop an announcement.
      return Soundbox.speak(text, o);
    }
  }
  if (source === 'builtin') return clips(bareText, lang, o).catch(() => Soundbox.speak(text, o));
  try {
    return await Soundbox.speak(text, o);
  } catch (e) {
    return await clips(bareText, lang, o).catch(() => Promise.reject(e));
  }
}

async function speakOnce(text: string, lang: Lang, s: Settings, bareText?: string) {
  await speakText(text, lang, s, bareText);
}

/**
 * Speaks in the chosen language; if that voice can't synthesise (e.g. Tamil voice data not
 * installed, or an online-only voice while offline) it falls back to English so a payment
 * is never silently missed. Returns the language actually used.
 */
async function speakWithFallback(item: Item, s: Settings): Promise<{lang: Lang; text: string; fellBack?: string}> {
  try {
    await speakOnce(item.text, item.lang, s, item.bareText);
    return {lang: item.lang, text: item.text};
  } catch (e: any) {
    if (!item.fallbackText) throw e;
    await speakText(item.fallbackText, 'en', {...s, voice: {...s.voice, voiceByLang: {}}});
    return {lang: 'en', text: item.fallbackText, fellBack: `${langTag(item.lang)} voice unavailable (${e?.message ?? e}); spoke in English`};
  }
}

async function loop() {
  running = true;
  while (queue.length) {
    const item = queue.shift()!;
    useAnnouncer.setState({speaking: true, current: item.text, queued: queue.length});
    const s = getSettings();
    try {
      if (s.voice.chime !== 'none') await Soundbox.playChime(s.voice.chime, s.voice.chimeVolume / 100);
      const times = Math.max(1, Math.min(3, s.voice.repeat));
      const spoken = await speakWithFallback(item, s);
      for (let i = 1; i < times; i++) {
        await wait(s.voice.repeatGapMs);
        await speakOnce(spoken.text, spoken.lang, s, spoken.lang === item.lang ? item.bareText : undefined);
      }
      if (s.announce.alsoEnglish && spoken.lang !== 'en' && item.fallbackText) {
        await wait(250);
        await speakText(item.fallbackText, 'en', s).catch(() => {});
      }
      if (item.txnId) {
        const t = data().txns.find(x => x.id === item.txnId);
        data().updateTxn(item.txnId, {
          announce: {status: 'announced', at: Date.now(), lang: spoken.lang, text: spoken.text, reason: spoken.fellBack, count: (t?.announce.count ?? 0) + 1},
        });
        data().setLastAnnounced(item.txnId);
        data().log({pkg: t?.source.pkg ?? '', title: 'Announced', snippet: spoken.text, detail: spoken.fellBack, decision: 'announced', txnId: item.txnId});
      }
    } catch (e: any) {
      if (item.txnId) {
        const t = data().txns.find(x => x.id === item.txnId);
        data().updateTxn(item.txnId, {
          announce: {...(t?.announce ?? {count: 0}), status: 'failed', reason: e?.message ?? 'Speech failed'},
        });
        data().log({pkg: '', title: 'Announcement failed', snippet: String(e?.message ?? e), decision: 'announce-failed', txnId: item.txnId});
      }
    }
  }
  running = false;
  useAnnouncer.setState({speaking: false, current: undefined, queued: 0});
  idleWaiters.forEach(r => r());
  idleWaiters = [];
}

export function whenIdle(timeoutMs = 45000): Promise<void> {
  if (!running && !queue.length) return Promise.resolve();
  return new Promise(resolve => {
    idleWaiters.push(resolve);
    setTimeout(resolve, timeoutMs);
  });
}

/** Immediate preview used by Voice Studio; interrupts whatever is playing. */
export async function preview(text: string, lang: Lang, override?: Partial<Settings['voice']>, withChime = true, bareText?: string) {
  const s = getSettings();
  const v = {...s.voice, ...override};
  await Soundbox.stopSpeaking();
  useAnnouncer.setState({speaking: true, current: text});
  try {
    if (withChime && v.chime !== 'none') await Soundbox.playChime(v.chime, v.chimeVolume / 100);
    await speakText(text, lang, s, bareText, override);
  } finally {
    if (!running) useAnnouncer.setState({speaking: false, current: undefined});
  }
}

export async function stopAll() {
  queue.length = 0;
  await Soundbox.stopSpeaking();
  useAnnouncer.setState({speaking: false, current: undefined, queued: 0});
}

export const personaById = (id: string) => PERSONAS.find(p => p.id === id) ?? PERSONAS[0];
