import type {SourceCategory} from './types';

export interface SourceDef {
  id: string;
  name: string;
  short: string;
  category: SourceCategory;
  packages: string[];
  /** Fixed bank for bank apps; UPI apps leave it to the notification text. */
  bank?: string;
  color: string;
  icon: string;
}

/**
 * Supported-source directory (PRD 8.3). Listing an app here does not mean every
 * notification format it emits is understood — unknown formats land in the Unknown queue.
 */
export const SOURCES: SourceDef[] = [
  {id: 'gpay', name: 'Google Pay', short: 'GPay', category: 'upi', color: '#4285F4', icon: 'google',
    packages: ['com.google.android.apps.nbu.paisa.user', 'com.google.android.apps.nbu.paisa.merchant']},
  {id: 'phonepe', name: 'PhonePe', short: 'PhonePe', category: 'upi', color: '#5F259F', icon: 'cellphone-nfc',
    packages: ['com.phonepe.app']},
  {id: 'paytm', name: 'Paytm', short: 'Paytm', category: 'upi', color: '#00BAF2', icon: 'wallet',
    packages: ['net.one97.paytm', 'com.paytm.business']},
  {id: 'bhim', name: 'BHIM UPI', short: 'BHIM', category: 'upi', color: '#F47920', icon: 'bank-transfer',
    packages: ['in.org.npci.upiapp']},
  {id: 'amazonpay', name: 'Amazon Pay', short: 'Amazon', category: 'upi', color: '#FF9900', icon: 'cart',
    packages: ['in.amazon.mShop.android.shopping']},
  {id: 'cred', name: 'CRED', short: 'CRED', category: 'upi', color: '#8A8A8A', icon: 'credit-card-outline',
    packages: ['com.dreamplug.androidapp']},
  {id: 'hdfc', name: 'HDFC Bank', short: 'HDFC', category: 'bank', bank: 'HDFC Bank', color: '#004C8F', icon: 'bank',
    packages: ['com.snapwork.hdfc', 'com.enstage.wibmo.hdfc']},
  {id: 'sbi', name: 'State Bank of India', short: 'SBI', category: 'bank', bank: 'SBI', color: '#22409A', icon: 'bank',
    packages: ['com.sbi.lotusintouch', 'com.sbi.SBIFreedomPlus', 'com.sbi.upi']},
  {id: 'icici', name: 'ICICI Bank', short: 'ICICI', category: 'bank', bank: 'ICICI Bank', color: '#B02A30', icon: 'bank',
    packages: ['com.csam.icici.bank.imobile']},
  {id: 'axis', name: 'Axis Bank', short: 'Axis', category: 'bank', bank: 'Axis Bank', color: '#97144D', icon: 'bank',
    packages: ['com.axis.mobile']},
  {id: 'kotak', name: 'Kotak Mahindra Bank', short: 'Kotak', category: 'bank', bank: 'Kotak Bank', color: '#ED1C24', icon: 'bank',
    packages: ['com.msf.kbank.mobile']},
  {id: 'sms', name: 'Bank SMS (via Messages app)', short: 'SMS', category: 'sms', color: '#10B981', icon: 'message-text',
    packages: ['com.google.android.apps.messaging', 'com.samsung.android.messaging', 'com.android.mms', 'com.oneplus.mms']},
];

export const MANUAL_SOURCE = {id: 'manual', name: 'Manual entry', category: 'manual' as const};
export const IMPORT_SOURCE = {id: 'import', name: 'Statement import', category: 'import' as const};
export const SHARE_SOURCE = {id: 'share', name: 'Shared text', category: 'manual' as const};

const byPkg = new Map<string, SourceDef>();
SOURCES.forEach(s => s.packages.forEach(p => byPkg.set(p, s)));

export const sourceForPackage = (pkg: string) => byPkg.get(pkg);

/**
 * Like sourceForPackage, but an event the native listener flagged as coming from the phone's
 * default SMS app counts as the SMS source even when that app's package isn't listed above
 * (Xiaomi, Vivo, Oppo, Realme, Truecaller … all ship different SMS apps).
 */
export const sourceForEvent = (ev: {pkg: string; defaultSms?: boolean; origin?: string}) =>
  byPkg.get(ev.pkg) ?? (ev.defaultSms || ev.origin === 'sms' ? SOURCES.find(s => s.id === 'sms') : undefined);
export const sourceById = (id: string) => SOURCES.find(s => s.id === id);

/** Bank names recognised in notification / SMS text, with their DLT sender-ID stems. */
const BANKS: [string, RegExp][] = [
  ['HDFC Bank', /\bhdfc\b|hdfcbk/i],
  ['SBI', /\bsbi\b|state bank|sbiinb|sbipsg|sbmsms|cbssbi/i],
  ['ICICI Bank', /\bicici\b|icicib/i],
  ['Axis Bank', /\baxis\b|axisbk/i],
  ['Kotak Bank', /\bkotak\b|kotakb/i],
  ['Punjab National Bank', /\bpnb\b|punjab national|pnbsms/i],
  ['Bank of Baroda', /bank of baroda|\bbob\b|bobtxn|bobsms/i],
  ['Canara Bank', /canara|canbnk/i],
  ['Union Bank', /union bank|unionb/i],
  ['Indian Overseas Bank', /indian overseas|\biob\b|iobchn|iobbnk/i],
  ['Indian Bank', /indian bank|indbnk/i],
  ['Bank of India', /bank of india|\bboi\b|boiind/i],
  ['Central Bank', /central bank|cbinbk/i],
  ['IndusInd Bank', /indusind|indusb/i],
  ['Yes Bank', /yes bank|yesbnk/i],
  ['IDFC First Bank', /\bidfc\b|idfcfb/i],
  ['Federal Bank', /federal bank|fedbnk/i],
  ['Karur Vysya Bank', /karur vysya|\bkvb\b|kvbank/i],
  ['City Union Bank', /city union|\bcub\b|cubank/i],
  ['Tamilnad Mercantile Bank', /tamilnad mercantile|\btmb\b|tmbank/i],
  ['South Indian Bank', /south indian bank|sibsms/i],
  ['AU Small Finance Bank', /\bau bank|au small|aubank/i],
  ['Paytm Payments Bank', /paytm payments bank|ppbl/i],
  ['Airtel Payments Bank', /airtel payments|airbnk/i],
];

export const BANK_NAMES = BANKS.map(b => b[0]);

export function detectBank(text: string): string | undefined {
  for (const [name, re] of BANKS) if (re.test(text)) return name;
  return undefined;
}

export function shortBank(bank?: string) {
  if (!bank) return '';
  return bank.replace(/\s*Bank$/i, '');
}
