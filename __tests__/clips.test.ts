import {amountPhrase} from '../src/engine/numberWords';
import {DEFAULT_TEMPLATES, LOW_CONFIDENCE_TEXT, renderTemplate, TEST_TEXT} from '../src/engine/templates';
import type {Lang} from '../src/engine/types';
import {planClips} from '../src/voice/clips';

const LANGS: Lang[] = ['ta', 'hi', 'en'];
const AMOUNTS = [0, 1, 7, 10, 11, 19, 21, 99, 100, 101, 250, 999, 1000, 1001, 1250, 2500, 9999, 10000, 11111,
  45678, 99999, 100000, 100001, 150000.5, 999999, 1234567, 10000000, 12345678.75, 999999999, 25.25];

describe('bundled voice clips cover every announcement without a device voice', () => {
  for (const lang of LANGS) {
    test(`${lang}: amounts in every mode`, () => {
      for (const a of AMOUNTS) {
        for (const mode of ['full', 'simplified', 'digits'] as const) {
          const t = amountPhrase(a, lang, mode);
          expect([t, planClips(t, lang)]).toEqual([t, expect.any(Array)]);
        }
      }
    });

    test(`${lang}: default templates without names, low-confidence and test text`, () => {
      for (const tpl of Object.values(DEFAULT_TEMPLATES[lang])) {
        const t = renderTemplate(tpl, {amount: amountPhrase(12345.5, lang)});
        expect([t, planClips(t, lang)]).toEqual([t, expect.any(Array)]);
      }
      expect(planClips(LOW_CONFIDENCE_TEXT[lang], lang)).not.toBeNull();
      expect(planClips(TEST_TEXT[lang], lang)).not.toBeNull();
    });

    test(`${lang}: unknown names are not covered (device voice handles them)`, () => {
      expect(planClips('Zyxwvut', lang)).toBeNull();
    });
  }
});
