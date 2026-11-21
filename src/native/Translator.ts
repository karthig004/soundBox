import {NativeModules} from 'react-native';
import {chunkText, LRU, parseGoogleResponse, segmentText} from '../engine/translateText';

const N = NativeModules.TranslatorNative;

/** Language tags shared by Google Translate and ML Kit. */
export const TR_LANGS = [
  {id: 'en', name: 'English', native: 'English'},
  {id: 'ta', name: 'Tamil', native: 'தமிழ்'},
  {id: 'hi', name: 'Hindi', native: 'हिन्दी'},
] as const;
export type TrLang = (typeof TR_LANGS)[number]['id'];

export class ModelMissingError extends Error {
  constructor(public langs: string[]) {
    super(`Offline language pack needed: ${langs.join(', ')}`);
  }
}

/** Which engine produced a translation. */
export type Engine = 'google' | 'device';
export interface TranslateResult {
  text: string;
  engine: Engine;
}

class HttpError extends Error {
  constructor(public status: number) {
    super(`Google Translate HTTP ${status}`);
  }
}

const ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const ONLINE_TIMEOUT_MS = 6000;
/** After a network failure skip the online try briefly, so offline typing stays instant. */
const NET_COOLDOWN_MS = 8000;
const HTTP_COOLDOWN_MS = 60000;

let onlineDownUntil = 0;
const webCache = new LRU<string>(150);
const sentenceCache = new LRU<string>(500);

/** One request to Google Translate (the same engine as translate.google.com). */
async function googleChunk(text: string, from: TrLang, to: TrLang): Promise<string> {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => ctrl?.abort(), ONLINE_TIMEOUT_MS);
  try {
    const res = await fetch(`${ENDPOINT}?client=gtx&sl=${from}&tl=${to}&dt=t&dj=0&ie=UTF-8&oe=UTF-8`, {
      method: 'POST',
      headers: {'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8'},
      body: `q=${encodeURIComponent(text)}`,
      signal: ctrl?.signal,
    });
    if (!res.ok) throw new HttpError(res.status);
    return parseGoogleResponse(await res.json());
  } finally {
    clearTimeout(timer);
  }
}

async function nativeOne(text: string, from: TrLang, to: TrLang): Promise<string> {
  try {
    return await N.translate(text, from, to);
  } catch (e: any) {
    if (e?.code === 'model_missing') throw new ModelMissingError(String(e.message).split(','));
    throw e;
  }
}

/** On-device (ML Kit) translation, sentence by sentence: far more accurate than one big string. */
async function offline(text: string, from: TrLang, to: TrLang): Promise<string> {
  if (!N) throw new Error('Offline translator is not in this build');
  const out: string[] = [];
  for (const p of segmentText(text)) {
    if (!p.translate) {
      out.push(p.text);
      continue;
    }
    const key = `${from}>${to}|${p.text}`;
    let t = sentenceCache.get(key);
    if (t === undefined) {
      t = (await nativeOne(p.text, from, to)).trim();
      sentenceCache.set(key, t);
    }
    out.push(t);
  }
  return out.join('');
}

/**
 * Translation that always answers: Google Translate when the phone is online, otherwise (or if the
 * request fails) the on-device engine. Each language pack downloads once (~30 MB), then works offline.
 */
export const Translator = {
  /** The on-device engine is in this build. */
  available: !!N,
  downloaded: async (): Promise<string[]> => (N ? N.downloadedLanguages() : []),
  download: (lang: TrLang, wifiOnly = false): Promise<boolean> =>
    N ? N.downloadLanguage(lang, wifiOnly) : Promise.reject(new Error('Translator not in this build')),
  remove: async (lang: TrLang): Promise<boolean> => {
    sentenceCache.clear();
    return N ? N.deleteLanguage(lang) : false;
  },
  translate: async (text: string, from: TrLang, to: TrLang, opts: {online?: boolean} = {}): Promise<TranslateResult> => {
    if (from === to) return {text, engine: 'device'};
    if (opts.online ?? true) {
      const key = `${from}>${to}|${text}`;
      const hit = webCache.get(key);
      if (hit !== undefined) return {text: hit, engine: 'google'};
      if (Date.now() >= onlineDownUntil) {
        try {
          const parts: string[] = [];
          for (const chunk of chunkText(text)) parts.push(await googleChunk(chunk, from, to));
          const out = parts.join('');
          if (out.trim()) {
            onlineDownUntil = 0;
            webCache.set(key, out);
            return {text: out, engine: 'google'};
          }
        } catch (e) {
          onlineDownUntil = Date.now() + (e instanceof HttpError ? HTTP_COOLDOWN_MS : NET_COOLDOWN_MS);
        }
      }
    }
    return {text: await offline(text, from, to), engine: 'device'};
  },
};
