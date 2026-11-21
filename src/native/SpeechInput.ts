import {NativeEventEmitter, NativeModules, PermissionsAndroid, Platform} from 'react-native';

const N = NativeModules.SpeechInputNative;
const emitter = N ? new NativeEventEmitter(N) : null;

export type SpeechEvent = {type: 'ready' | 'partial' | 'level' | 'end'; text?: string; level?: number};

const TAGS: Record<string, string> = {en: 'en-IN', ta: 'ta-IN', hi: 'hi-IN'};

/** Voice → text through the phone's recogniser (offline when its language pack is installed). */
export const SpeechInput = {
  available: !!N,
  async ensurePermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return true;
    const p = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
    if (await PermissionsAndroid.check(p)) return true;
    return (await PermissionsAndroid.request(p)) === PermissionsAndroid.RESULTS.GRANTED;
  },
  /** Resolves with the final text once the speaker pauses (or stop() is called). */
  start: (lang: string): Promise<string> => (N ? N.start(TAGS[lang] ?? lang) : Promise.reject(new Error('Voice input not in this build'))),
  stop: (): Promise<void> => (N ? N.stop() : Promise.resolve()),
  cancel: (): Promise<void> => (N ? N.cancel() : Promise.resolve()),
  listen: (cb: (e: SpeechEvent) => void) => {
    const sub = emitter?.addListener('SpeechInput', cb);
    return () => sub?.remove();
  },
};
