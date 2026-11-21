import {create} from 'zustand';
import type {AmountMode} from '../engine/numberWords';
import type {TemplateKey, TemplateStyle} from '../engine/templates';
import type {Lang} from '../engine/types';
import {readJSON, writeJSON} from './storage';

export interface VoiceSettings {
  personaId: string;
  voiceByLang: Partial<Record<Lang, string>>;
  engine: string | null;
  pitch: number;
  rate: number;
  volume: number; // 0..100
  boost: boolean;
  boostLevel: number; // 0..100 media volume while speaking
  duck: boolean;
  chime: string;
  chimeVolume: number; // 0..100
  repeat: number; // 1..3
  repeatGapMs: number;
  /**
   * auto: bundled clips whenever they cover the sentence, device voice for names (falls back to clips);
   * builtin: always bundled clips (names dropped); device: phone TTS first.
   */
  source: 'auto' | 'builtin' | 'device';
}

export interface AnnounceSettings {
  credit: boolean;
  debit: boolean;
  refund: boolean;
  reversal: boolean;
  includeSender: boolean;
  includeBank: boolean;
  amountMode: AmountMode;
  style: TemplateStyle;
  custom: Partial<Record<TemplateKey, string>>;
  lowConfidence: boolean;
  unassigned: boolean;
  minAmount: number;
  /** After a Tamil/Hindi announcement, also speak the English translation. */
  alsoEnglish: boolean;
}

export interface Settings {
  onboarded: boolean;
  mode: 'personal' | 'business';
  businessName: string;
  ownerName: string;
  language: Lang;
  theme: 'system' | 'light' | 'dark';
  scheme: string;
  /** Branding revision already applied (one-time switch to the RubyAlert colours). */
  brandRev: number;
  active: boolean;
  pausedUntil: number;
  voice: VoiceSettings;
  announce: AnnounceSettings;
  quiet: {enabled: boolean; start: string; end: string};
  sources: Record<string, boolean>;
  captureUnknownApps: boolean;
  /** Read the exact SMS sender via the SMS permission instead of the SMS app's notification. */
  smsVerify: boolean;
  /** Foreground "Live" service: survives swipe-away, keeps announcements instant. */
  keepAlive: boolean;
  /** Extra sender codes (e.g. a co-operative bank's header) the user marked as their bank. */
  trustedSenders: string[];
  appLock: boolean;
  retentionDays: number; // 0 = keep forever
  dateFormat: 'DMY' | 'MDY' | 'YMD';
  time24: boolean;
  haptics: boolean;
  reduceMotion: boolean;
  showAmounts: boolean;
  /** Translate screen: use Google Translate while online (text you type is sent to Google); off = on-device only. */
  translateOnline: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  onboarded: false,
  mode: 'business',
  businessName: '',
  ownerName: '',
  language: 'ta',
  theme: 'system',
  scheme: 'ruby',
  brandRev: 1,
  active: true,
  pausedUntil: 0,
  voice: {
    personaId: 'natural',
    voiceByLang: {},
    engine: null,
    pitch: 1,
    rate: 1,
    volume: 100,
    boost: false,
    boostLevel: 80,
    duck: true,
    chime: 'cash',
    chimeVolume: 80,
    repeat: 1,
    repeatGapMs: 600,
    source: 'auto',
  },
  announce: {
    credit: true,
    debit: false,
    refund: true,
    reversal: true,
    includeSender: true,
    includeBank: false,
    amountMode: 'full',
    style: 'full',
    custom: {},
    lowConfidence: false,
    alsoEnglish: false,
    unassigned: true,
    minAmount: 0,
  },
  quiet: {enabled: false, start: '22:00', end: '07:00'},
  sources: {gpay: true, phonepe: true, paytm: true, bhim: true, sms: true},
  captureUnknownApps: false,
  smsVerify: true,
  keepAlive: true,
  trustedSenders: [],
  appLock: false,
  retentionDays: 0,
  dateFormat: 'DMY',
  time24: false,
  haptics: true,
  reduceMotion: false,
  showAmounts: true,
  translateOnline: true,
};

const KEY = 'settings.v1';

function load(): Settings {
  const s = readJSON<Partial<Settings>>(KEY, {});
  if ((s.brandRev ?? 0) < 1) {
    // RubyAlert rebrand: move existing installs onto the brand colours once; later picks stick.
    s.scheme = 'ruby';
    s.brandRev = 1;
  }
  return {
    ...DEFAULT_SETTINGS,
    ...s,
    voice: {...DEFAULT_SETTINGS.voice, ...(s.voice ?? {})},
    announce: {...DEFAULT_SETTINGS.announce, ...(s.announce ?? {})},
    quiet: {...DEFAULT_SETTINGS.quiet, ...(s.quiet ?? {})},
    sources: {...DEFAULT_SETTINGS.sources, ...(s.sources ?? {})},
  };
}

interface SettingsStore extends Settings {
  set: (patch: Partial<Settings>) => void;
  setVoice: (patch: Partial<VoiceSettings>) => void;
  setAnnounce: (patch: Partial<AnnounceSettings>) => void;
  reset: () => void;
}

export const useSettings = create<SettingsStore>((set, get) => {
  const persist = () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const {set: _s, setVoice: _v, setAnnounce: _a, reset: _r, ...data} = get();
    writeJSON(KEY, data);
  };
  return {
    ...load(),
    set: patch => {
      set(patch);
      persist();
    },
    setVoice: patch => {
      set({voice: {...get().voice, ...patch}});
      persist();
    },
    setAnnounce: patch => {
      set({announce: {...get().announce, ...patch}});
      persist();
    },
    reset: () => {
      set({...DEFAULT_SETTINGS});
      persist();
    },
  };
});

export const getSettings = () => useSettings.getState();

export function inQuietHours(s: Settings, d = new Date()) {
  if (!s.quiet.enabled) return false;
  const toMin = (hm: string) => {
    const [h, m] = hm.split(':').map(Number);
    return h * 60 + (m || 0);
  };
  const now = d.getHours() * 60 + d.getMinutes();
  const a = toMin(s.quiet.start), b = toMin(s.quiet.end);
  return a <= b ? now >= a && now < b : now >= a || now < b;
}

export const MODE_INFO: Record<Settings['mode'], {title: string; text: string}> = {
  business: {title: 'Business', text: 'Announces customer payments · daily closing & collection reports'},
  personal: {title: 'Personal', text: 'Announces money in and out · monthly spending insights'},
};

/**
 * Switches mode and applies that mode's announcement preset: a shop wants to hear incoming
 * payments only; a person also wants to hear money going out.
 */
export function switchMode(mode: Settings['mode']) {
  const s = getSettings();
  if (s.mode === mode) return;
  s.set({mode});
  s.setAnnounce(mode === 'business' ? {credit: true, debit: false} : {credit: true, debit: true});
}
