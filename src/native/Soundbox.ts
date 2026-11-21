import {NativeModules, Platform, Vibration} from 'react-native';

export interface NativeStatus {
  notificationAccess: boolean;
  listenerConnected: boolean;
  ignoringBatteryOptimizations: boolean;
  lastEventAt: number;
  lastEventPkg: string;
  buffered: number;
  sdk: number;
  manufacturer: string;
  model: string;
  ttsReady: boolean;
  /** RECEIVE_SMS granted (needed for "Verify SMS sender"). */
  smsPermission?: boolean;
}

export interface DeviceVoice {
  id: string;
  language: string;
  languageName: string;
  quality: number;
  latency: number;
  network: boolean;
  notInstalled: boolean;
  gender: string;
}

/** A payment-looking notification the native listener skipped, and why. */
export interface DropEntry {
  at: number;
  pkg: string;
  title: string;
  snippet: string;
  reason: string;
}

export interface TtsEngine {
  name: string;
  label: string;
  isDefault: boolean;
}

export interface SpeakOpts {
  language: string;
  voice?: string | null;
  pitch: number;
  rate: number;
  volume: number;
  boostTo?: number | null;
  duck?: boolean;
  engine?: string | null;
}

const N = NativeModules.SoundboxNative;
const R = NativeModules.ReminderNative;
const available = !!N;
export const isAndroid = Platform.OS === 'android';
export const hasNative = available;

const noop = async () => undefined as any;

/** Thin typed facade over the native module; every call degrades gracefully when unavailable (iOS / tests). */
export const Soundbox = {
  getStatus: (): Promise<NativeStatus | null> => (available ? N.getStatus() : Promise.resolve(null)),
  openNotificationAccess: (): Promise<boolean> => (available ? N.openNotificationAccess() : noop()),
  openBatterySettings: (): Promise<boolean> => (available ? N.openBatterySettings() : noop()),
  openAppSettings: (): Promise<boolean> => (available ? N.openAppSettings() : noop()),
  openTtsSettings: (): Promise<boolean> => (available ? N.openTtsSettings() : noop()),
  installTtsData: (): Promise<boolean> => (available ? N.installTtsData() : noop()),
  requestRebind: (): Promise<void> => (available ? N.requestRebind() : noop()),
  warmVoice: (language: string, voice?: string | null): Promise<void> =>
    available && N.warmVoice ? N.warmVoice(language, voice ?? null) : noop(),
  setKeepAlive: (on: boolean): Promise<void> => (available && N.setKeepAlive ? N.setKeepAlive(on) : noop()),
  forceRebind: (): Promise<void> => (available && N.forceRebind ? N.forceRebind() : noop()),
  openAutostartSettings: (): Promise<string> => (available && N.openAutostartSettings ? N.openAutostartSettings() : Promise.resolve("none")),
  installedPackages: (pkgs: string[]): Promise<Record<string, boolean>> =>
    available ? N.installedPackages(pkgs) : Promise.resolve({}),
  setConfig: (enabled: boolean, watched: string[], captureUnknown: boolean, watchSms: boolean, smsVerify: boolean): Promise<void> =>
    available ? N.setConfig(enabled, watched, captureUnknown, watchSms, smsVerify) : noop(),
  getDefaultSmsPackage: (): Promise<string | null> =>
    available && N.getDefaultSmsPackage ? N.getDefaultSmsPackage() : Promise.resolve(null),
  getDropLog: async (): Promise<DropEntry[]> => {
    if (!available || !N.getDropLog) return [];
    try {
      return JSON.parse(await N.getDropLog());
    } catch {
      return [];
    }
  },
  clearDropLog: (): Promise<void> => (available && N.clearDropLog ? N.clearDropLog() : noop()),
  drainEvents: async (): Promise<any[]> => {
    if (!available) return [];
    try {
      return JSON.parse(await N.drainEvents());
    } catch {
      return [];
    }
  },
  ttsInit: (engine?: string | null): Promise<boolean> => (available ? N.ttsInit(engine ?? null) : Promise.resolve(false)),
  getVoices: (): Promise<DeviceVoice[]> => (available ? N.getVoices() : Promise.resolve([])),
  getEngines: (): Promise<TtsEngine[]> => (available ? N.getEngines() : Promise.resolve([])),
  getLanguageStatus: (tag: string): Promise<string> => (available ? N.getLanguageStatus(tag) : Promise.resolve('not-ready')),
  speak: (text: string, o: SpeakOpts): Promise<string> =>
    available ? N.speak(text, o) : Promise.reject(new Error('Speech not available on this platform build')),
  /** Plays bundled voice clips back-to-back (works without any device TTS voice). */
  playClips: (files: string[], o: SpeakOpts & {gapMs?: number}): Promise<string> =>
    available && N.playClips ? N.playClips(files, o) : Promise.reject(new Error('Voice clips not available in this build')),
  stopSpeaking: (): Promise<void> => (available ? N.stopSpeaking() : noop()),
  playChime: (id: string, volume: number): Promise<void> => (available ? N.playChime(id, volume) : noop()),
  vibrate: (ms = 12) => (available ? N.vibrate(ms) : Vibration.vibrate(ms)),
  saveFile: (base64: string, filename: string, mime: string): Promise<{uri: string; savedTo: string}> =>
    N.saveFile(base64, filename, mime),
  shareFile: (uri: string, mime: string, title: string): Promise<boolean> => N.shareFile(uri, mime, title),
  pickTextFile: (): Promise<{name: string; content: string} | null> =>
    available ? N.pickTextFile() : Promise.resolve(null),
  canAuthenticate: (): Promise<boolean> => (available ? N.canAuthenticate() : Promise.resolve(false)),
  authenticate: (title: string, subtitle: string): Promise<boolean> =>
    available ? N.authenticate(title, subtitle) : Promise.resolve(true),
};

/** Persistent Android alarm scheduling for personal reminders. */
export const ReminderScheduler = {
  available: !!R,
  schedule: (id: string, text: string, at: number): Promise<void> =>
    R ? R.schedule(id, text, at) : Promise.resolve(),
  cancel: (id: string): Promise<void> => R ? R.cancel(id) : Promise.resolve(),
};
