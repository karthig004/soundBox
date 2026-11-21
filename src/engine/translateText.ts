/**
 * Pure helpers for the Translate screen (no React Native imports, so they are unit-testable):
 * sentence splitting for the on-device engine, parsing Google's reply, and a tiny LRU cache.
 */

export interface Piece {
  text: string;
  /** true → send to the translator; false → copy through unchanged (whitespace, digits, punctuation). */
  translate: boolean;
}

/** Latin (incl. accented), Devanagari and Tamil letters: the only scripts this app translates. */
const LETTER = /[A-Za-zÀ-ɏऀ-ॿ஀-௿]/;
/** Sentence enders: . ! ? … plus the Hindi danda (। ॥). */
const END = /[.!?…।॥]+["'”’)\]]*(?=\s|$)/g;
/** "Mr. Kumar", "Dr. Rao", "St. Mary" … are not sentence ends. */
const ABBREV = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'st', 'vs', 'no', 'rs', 'smt', 'sri', 'shri', 'ltd', 'pvt', 'co']);
/** The on-device model works best on short inputs, so a very long run is wrapped at a space. */
const MAX_RUN = 400;

function isAbbreviation(line: string, endIdx: number, ender: string): boolean {
  if (ender !== '.') return false;
  const word = /([A-Za-z]+)$/.exec(line.slice(Math.max(0, endIdx - 12), endIdx));
  if (!word) return false;
  const w = word[1];
  const before = line[endIdx - w.length - 1];
  if (before === '.') return true; // e.g. / i.e. / a.m. / p.m.
  if (w.length === 1 && w === w.toUpperCase()) return true; // initials: "K. Ramesh"
  return ABBREV.has(w.toLowerCase());
}

function splitSentences(line: string): string[] {
  const out: string[] = [];
  let start = 0;
  END.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = END.exec(line))) {
    if (isAbbreviation(line, m.index, m[0])) continue;
    const end = m.index + m[0].length;
    out.push(line.slice(start, end));
    start = end;
  }
  if (start < line.length) out.push(line.slice(start));
  return out;
}

/** Wraps `core` into ≤ MAX_RUN chunks at spaces. Pieces concatenate back to exactly `core`. */
function wrapRun(core: string, push: (text: string, translate: boolean) => void) {
  let rest = core;
  while (rest.length > MAX_RUN) {
    let cut = rest.lastIndexOf(' ', MAX_RUN);
    if (cut < MAX_RUN / 2) cut = MAX_RUN;
    const head = rest.slice(0, cut);
    push(head, LETTER.test(head));
    rest = rest.slice(cut);
    const ws = /^\s+/.exec(rest);
    if (ws) {
      push(ws[0], false);
      rest = rest.slice(ws[0].length);
    }
  }
  if (rest) push(rest, LETTER.test(rest));
}

/**
 * Splits text into sentence-sized pieces for the on-device engine. Line breaks, spacing, digits and
 * punctuation-only runs are kept as non-translated pieces, so `join` of all piece texts is the input.
 */
export function segmentText(input: string): Piece[] {
  const pieces: Piece[] = [];
  const push = (text: string, translate: boolean) => {
    if (text) pieces.push({text, translate});
  };
  for (const part of input.split(/(\r\n|\n|\r)/)) {
    if (part === '') continue;
    if (part === '\n' || part === '\r' || part === '\r\n') {
      push(part, false);
      continue;
    }
    for (const sentence of splitSentences(part)) {
      const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(sentence) as RegExpExecArray;
      push(m[1], false);
      wrapRun(m[2], push);
      push(m[3], false);
    }
  }
  return pieces;
}

/** Groups pieces into chunks ≤ `max` chars (for the online request), cutting only between pieces. */
export function chunkText(text: string, max = 4000): string[] {
  if (text.length <= max) return [text];
  const out: string[] = [];
  let cur = '';
  for (const p of segmentText(text)) {
    if (cur && cur.length + p.text.length > max) {
      out.push(cur);
      cur = '';
    }
    cur += p.text;
  }
  if (cur) out.push(cur);
  return out;
}

/** Google's reply is `[[[translated, original, …], …], …]`; the translation is the joined first items. */
export function parseGoogleResponse(data: unknown): string {
  const segs = Array.isArray(data) ? data[0] : null;
  if (!Array.isArray(segs)) throw new Error('Unexpected translate response');
  return segs.map(s => (Array.isArray(s) && typeof s[0] === 'string' ? s[0] : '')).join('');
}

/** Least-recently-used cache. */
export class LRU<V> {
  private m = new Map<string, V>();
  constructor(private max: number) {}
  get(k: string): V | undefined {
    const v = this.m.get(k);
    if (v !== undefined) {
      this.m.delete(k);
      this.m.set(k, v);
    }
    return v;
  }
  set(k: string, v: V) {
    this.m.delete(k);
    this.m.set(k, v);
    if (this.m.size > this.max) this.m.delete(this.m.keys().next().value as string);
  }
  clear() {
    this.m.clear();
  }
}
