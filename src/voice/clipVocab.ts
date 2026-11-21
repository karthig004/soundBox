import {intWords, amountPhrase} from '../engine/numberWords';
import {DEFAULT_TEMPLATES, LOW_CONFIDENCE_TEXT, renderTemplate, TEST_TEXT} from '../engine/templates';
import type {Lang} from '../engine/types';

/**
 * Builds the list of phrases that are pre-recorded as bundled voice clips, so announcements
 * work on every device (including iPhone, which has no Tamil system voice) without any
 * voice download. Used by scripts/gen-voice-clips.ts; the app reads the generated manifest.
 */

export const CLIP_LANGS: Lang[] = ['ta', 'hi', 'en'];

/** Same normalisation the runtime planner uses: no punctuation, single spaces, lower case. */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-–]/g, ' ')
    .replace(/[,.।!?“”"'’]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** FNV-1a — stable short file name for a clip. */
export function clipFile(lang: Lang, text: string): string {
  let h = 0x811c9dc5;
  const s = `${lang}|${normalize(text)}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `${lang}_${h.toString(16).padStart(8, '0')}.mp3`;
}

/** Text around {amount} in each default template, with every optional segment dropped. */
function templatePhrases(lang: Lang): string[] {
  const out: string[] = [];
  for (const tpl of Object.values(DEFAULT_TEMPLATES[lang])) {
    const r = renderTemplate(tpl, {amount: '\u0001'});
    for (const part of r.split('\u0001')) if (normalize(part)) out.push(part);
  }
  return out;
}

export function buildVocab(lang: Lang): string[] {
  const set = new Set<string>();
  const addWords = (s: string) => normalize(s).split(' ').filter(Boolean).forEach(w => set.add(w));
  // Hindi 1..99 are single irregular words; for every language a whole 1..99 clip sounds more
  // natural than two halves, so record them whole too.
  for (let n = 0; n < 100; n++) set.add(normalize(intWords(n, lang)));
  // Every word that can appear in any amount (Indian numbering, up to 99 crore).
  for (let n = 0; n < 100000; n += n < 2000 ? 1 : 7) addWords(intWords(n, lang));
  for (let n = 1; n < 100; n++) {
    addWords(intWords(n * 1000, lang));
    addWords(intWords(n * 1000 + 1, lang));
    addWords(intWords(n * 100000, lang));
    addWords(intWords(n * 100000 + 1, lang));
    addWords(intWords(n * 10000000, lang));
    addWords(intWords(n * 10000000 + 1, lang));
  }
  for (const n of [1, 2, 1.5, 25.25]) addWords(amountPhrase(n, lang, 'full'));
  for (const p of templatePhrases(lang)) set.add(normalize(p));
  set.add(normalize(LOW_CONFIDENCE_TEXT[lang]));
  set.add(normalize(TEST_TEXT[lang]));
  set.delete('');
  return [...set];
}
