import type {Lang} from '../engine/types';
import {intWords} from '../engine/numberWords';
import {normalize} from './clipVocab';
import manifest from './clipManifest.json';

const M = manifest as Record<string, Record<string, string>>;

/** Phrase entries by language, longest (in words) first, so greedy matching prefers whole phrases. */
const entries: Partial<Record<Lang, {words: string[]; file: string}[]>> = {};

function table(lang: Lang) {
  if (!entries[lang]) {
    entries[lang] = Object.entries(M[lang] ?? {})
      .map(([text, file]) => ({words: text.split(' '), file}))
      .sort((a, b) => b.words.length - a.words.length);
  }
  return entries[lang]!;
}

export const hasClips = (lang: Lang) => Object.keys(M[lang] ?? {}).length > 0;

/**
 * Splits text into bundled clips. Returns null when any word has no recording
 * (e.g. a sender's name), so the caller can use the device voice instead.
 */
export function planClips(text: string, lang: Lang): string[] | null {
  const words = normalize(text)
    .split(' ')
    .flatMap(w => (/^\d+$/.test(w) ? normalize(intWords(Number(w), lang)).split(' ') : [w]))
    .filter(Boolean);
  if (!words.length) return null;
  const list = table(lang);
  const out: string[] = [];
  let i = 0;
  while (i < words.length) {
    const hit = list.find(e => e.words.length <= words.length - i && e.words.every((w, k) => words[i + k] === w));
    if (!hit) return null;
    out.push(hit.file);
    i += hit.words.length;
  }
  return out;
}
