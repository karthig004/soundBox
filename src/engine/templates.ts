import {amountPhrase, AmountMode} from './numberWords';
import {shortBank} from './sources';
import type {Lang, Txn} from './types';

export type TemplateKey = 'credit' | 'debit' | 'refund' | 'reversal';
export type TemplateStyle = 'amount' | 'amount_sender' | 'amount_bank' | 'full' | 'custom';

/**
 * Template syntax: {token} is replaced; [ ... ] is an optional segment that is dropped
 * when any token inside it has no value. Nothing is ever invented for missing data.
 */
export const DEFAULT_TEMPLATES: Record<Lang, Record<TemplateKey, string>> = {
  en: {
    credit: '{amount} received[ from {sender}][ in {bank}].',
    debit: '{amount} paid[ to {beneficiary}] from your[ {bank}] account.',
    refund: 'Refund of {amount} received[ from {sender}].',
    reversal: '{amount} reversed to your[ {bank}] account.',
  },
  ta: {
    credit: '{amount}[, {sender} அவர்களிடமிருந்து][, {bank} கணக்கில்] பெறப்பட்டது.',
    debit: '{amount}[, {beneficiary} அவர்களுக்கு] உங்கள்[ {bank}] வங்கிக் கணக்கிலிருந்து செலுத்தப்பட்டது.',
    refund: '[{sender} இடமிருந்து ]{amount} திரும்பப் பெறப்பட்டது.',
    reversal: '{amount} உங்கள்[ {bank}] கணக்கிற்கு திருப்பி அனுப்பப்பட்டது.',
  },
  hi: {
    credit: '[{sender} से ]{amount} प्राप्त हुए[, {bank} खाते में]।',
    debit: '[{beneficiary} को ]{amount} का भुगतान आपके[ {bank}] बैंक खाते से किया गया।',
    refund: '[{sender} से ]{amount} का रिफंड प्राप्त हुआ।',
    reversal: '{amount} आपके[ {bank}] खाते में वापस आ गए।',
  },
};

export const TOKENS = ['amount', 'sender', 'beneficiary', 'bank', 'business', 'account', 'time'] as const;

export const LOW_CONFIDENCE_TEXT: Record<Lang, string> = {
  en: 'A payment notification was received. Please check the details.',
  ta: 'ஒரு பணப் பரிவர்த்தனை அறிவிப்பு வந்துள்ளது. விவரங்களைச் சரிபார்க்கவும்.',
  hi: 'एक भुगतान सूचना मिली है। कृपया विवरण जांचें।',
};

export const TEST_TEXT: Record<Lang, string> = {
  en: 'RubyAlert is ready. Payments will be announced like this.',
  ta: 'ஸ்மார்ட் சவுண்ட்பாக்ஸ் தயார். பணம் வந்தால் இப்படி அறிவிக்கப்படும்.',
  hi: 'स्मार्ट साउंडबॉक्स तैयार है। भुगतान की घोषणा ऐसे होगी।',
};

export function renderTemplate(tpl: string, values: Record<string, string | undefined>): string {
  const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');
  const optional = tpl.replace(/\[([^\]]*)\]/g, (_, seg: string) => {
    const keys = [...seg.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
    return keys.every(k => values[k]) ? seg : '';
  });
  return fill(optional).replace(/\s+([,.।])/g, '$1').replace(/\s{2,}/g, ' ').replace(/^[,\s]+/, '').trim();
}

export interface AnnounceOptions {
  lang: Lang;
  style: TemplateStyle;
  amountMode: AmountMode;
  includeSender: boolean;
  includeBank: boolean;
  custom?: Partial<Record<TemplateKey, string>>;
  businessName?: string;
  accountName?: string;
}

export function templateKey(t: Pick<Txn, 'kind' | 'direction'>): TemplateKey {
  if (t.kind === 'refund') return 'refund';
  if (t.kind === 'reversal') return 'reversal';
  return t.direction === 'debit' ? 'debit' : 'credit';
}

export function buildAnnouncement(t: Txn, o: AnnounceOptions): string {
  const key = templateKey(t);
  const style = o.style;
  const tpl = style === 'custom' && o.custom?.[key] ? o.custom[key]! : DEFAULT_TEMPLATES[o.lang][key];
  const wantSender = style === 'custom' || style === 'full' || style === 'amount_sender' ? o.includeSender : false;
  const wantBank = style === 'custom' || style === 'full' || style === 'amount_bank' ? o.includeBank : false;
  const sender = t.corrections?.sender ?? t.sender;
  const beneficiary = t.corrections?.beneficiary ?? t.beneficiary;
  const d = new Date(t.timestamp);
  return renderTemplate(tpl, {
    amount: amountPhrase(t.amount, o.lang, o.amountMode),
    sender: wantSender ? sender : undefined,
    beneficiary: wantSender ? beneficiary : undefined,
    bank: wantBank ? shortBank(t.bank) : undefined,
    business: o.businessName || undefined,
    account: o.accountName,
    time: `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`,
  });
}
