import type {Lang} from './types';

// ---------------- English (Indian numbering: lakh / crore) ----------------

const EN_ONES = ['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const EN_TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

function en99(n: number): string {
  if (n < 20) return EN_ONES[n];
  const t = Math.floor(n / 10), o = n % 10;
  return EN_TENS[t] + (o ? '-' + EN_ONES[o] : '');
}

function enInt(n: number): string {
  if (n === 0) return 'zero';
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const th = Math.floor(n / 1000); n %= 1000;
  const h = Math.floor(n / 100); const rest = n % 100;
  if (crore) parts.push(enInt(crore) + ' crore');
  if (lakh) parts.push(en99(lakh) + ' lakh');
  if (th) parts.push(en99(th) + ' thousand');
  if (h) parts.push(EN_ONES[h] + ' hundred');
  if (rest) parts.push((parts.length ? 'and ' : '') + en99(rest));
  return parts.join(' ');
}

// ---------------- Tamil ----------------

const TA_ONES = ['', 'ஒன்று', 'இரண்டு', 'மூன்று', 'நான்கு', 'ஐந்து', 'ஆறு', 'ஏழு', 'எட்டு', 'ஒன்பது'];
const TA_TEENS = ['பத்து', 'பதினொன்று', 'பன்னிரண்டு', 'பதின்மூன்று', 'பதினான்கு', 'பதினைந்து',
  'பதினாறு', 'பதினேழு', 'பதினெட்டு', 'பத்தொன்பது'];
const TA_TENS = ['', '', 'இருபது', 'முப்பது', 'நாற்பது', 'ஐம்பது', 'அறுபது', 'எழுபது', 'எண்பது', 'தொண்ணூறு'];
const TA_TENS_C = ['', '', 'இருபத்து', 'முப்பத்து', 'நாற்பத்து', 'ஐம்பத்து', 'அறுபத்து', 'எழுபத்து', 'எண்பத்து', 'தொண்ணூற்று'];
const TA_HUND = ['', 'நூறு', 'இருநூறு', 'முந்நூறு', 'நானூறு', 'ஐநூறு', 'அறுநூறு', 'எழுநூறு', 'எண்ணூறு', 'தொள்ளாயிரம்'];
const TA_HUND_C = ['', 'நூற்று', 'இருநூற்று', 'முந்நூற்று', 'நானூற்று', 'ஐநூற்று', 'அறுநூற்று', 'எழுநூற்று', 'எண்ணூற்று', 'தொள்ளாயிரத்து'];
const TA_THOU: Record<number, string> = {
  1: 'ஆயிரம்', 2: 'இரண்டாயிரம்', 3: 'மூவாயிரம்', 4: 'நான்காயிரம்', 5: 'ஐந்தாயிரம்',
  6: 'ஆறாயிரம்', 7: 'ஏழாயிரம்', 8: 'எட்டாயிரம்', 9: 'ஒன்பதாயிரம்', 10: 'பத்தாயிரம்',
};

function ta99(n: number): string {
  if (n < 10) return TA_ONES[n];
  if (n < 20) return TA_TEENS[n - 10];
  const t = Math.floor(n / 10), o = n % 10;
  return o ? `${TA_TENS_C[t]} ${TA_ONES[o]}` : TA_TENS[t];
}

/** Each segment has a standalone form and a "joining" form used when more words follow. */
function taInt(n: number): string {
  if (n === 0) return 'பூஜ்ஜியம்';
  const segs: [string, string][] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const th = Math.floor(n / 1000); n %= 1000;
  const h = Math.floor(n / 100); const rest = n % 100;
  if (crore) {
    const b = crore === 1 ? 'ஒரு' : taInt(crore);
    segs.push([`${b} கோடி`, `${b} கோடியே`]);
  }
  if (lakh) {
    const b = lakh === 1 ? 'ஒரு' : ta99(lakh);
    segs.push([`${b} லட்சம்`, `${b} லட்சத்து`]);
  }
  if (th) {
    const s = TA_THOU[th] ?? `${ta99(th)} ஆயிரம்`;
    segs.push([s, s.replace(/ம்$/, 'த்து')]);
  }
  if (h) segs.push([TA_HUND[h], TA_HUND_C[h]]);
  if (rest) segs.push([ta99(rest), ta99(rest)]);
  return segs.map((s, i) => (i < segs.length - 1 ? s[1] : s[0])).join(' ');
}

// ---------------- Hindi ----------------

const HI_99 = ('शून्य एक दो तीन चार पाँच छह सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस ' +
  'बीस इक्कीस बाईस तेईस चौबीस पच्चीस छब्बीस सत्ताईस अट्ठाईस उनतीस तीस इकतीस बत्तीस तैंतीस चौंतीस पैंतीस ' +
  'छत्तीस सैंतीस अड़तीस उनतालीस चालीस इकतालीस बयालीस तैंतालीस चवालीस पैंतालीस छियालीस सैंतालीस अड़तालीस ' +
  'उनचास पचास इक्यावन बावन तिरपन चौवन पचपन छप्पन सत्तावन अट्ठावन उनसठ साठ इकसठ बासठ तिरसठ चौंसठ पैंसठ ' +
  'छियासठ सड़सठ अड़सठ उनहत्तर सत्तर इकहत्तर बहत्तर तिहत्तर चौहत्तर पचहत्तर छिहत्तर सतहत्तर अठहत्तर उन्यासी ' +
  'अस्सी इक्यासी बयासी तिरासी चौरासी पचासी छियासी सत्तासी अट्ठासी नवासी नब्बे इक्यानवे बानवे तिरानवे चौरानवे ' +
  'पचानवे छियानवे सत्तानवे अट्ठानवे निन्यानवे').split(' ');

function hiInt(n: number): string {
  if (n === 0) return HI_99[0];
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const th = Math.floor(n / 1000); n %= 1000;
  const h = Math.floor(n / 100); const rest = n % 100;
  if (crore) parts.push(hiInt(crore) + ' करोड़');
  if (lakh) parts.push(HI_99[lakh] + ' लाख');
  if (th) parts.push(HI_99[th] + ' हज़ार');
  if (h) parts.push(HI_99[h] + ' सौ');
  if (rest) parts.push(HI_99[rest]);
  return parts.join(' ');
}

export function intWords(n: number, lang: Lang): string {
  const v = Math.floor(Math.abs(n));
  return lang === 'ta' ? taInt(v) : lang === 'hi' ? hiInt(v) : enInt(v);
}

export type AmountMode = 'full' | 'simplified' | 'digits';

/** Amount phrase including the currency word in the position natural for the language. */
export function amountPhrase(amount: number, lang: Lang, mode: AmountMode = 'full'): string {
  const rupees = Math.floor(amount + 1e-9);
  const paise = Math.round((amount - rupees) * 100);

  if (mode === 'digits') {
    const d = paise ? amount.toFixed(2) : String(rupees);
    if (lang === 'ta') return `ரூபாய் ${d}`;
    if (lang === 'hi') return `${d} रुपये`;
    return `${d} rupees`;
  }
  const withPaise = mode === 'full' && paise > 0;
  const rounded = mode === 'simplified' ? Math.round(amount) : rupees;

  if (lang === 'ta') {
    const base = `ரூபாய் ${taInt(rounded)}`;
    return withPaise ? `${base}, ${taInt(paise)} பைசா` : base;
  }
  if (lang === 'hi') {
    const base = `${hiInt(rounded)} रुपये`;
    return withPaise ? `${base} ${hiInt(paise)} पैसे` : base;
  }
  const w = enInt(rounded);
  const base = `${w.charAt(0).toUpperCase()}${w.slice(1)} ${rounded === 1 ? 'rupee' : 'rupees'}`;
  return withPaise ? `${base} and ${enInt(paise)} paise` : base;
}
