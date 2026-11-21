export type Lang = 'en' | 'ta' | 'hi';
export type Direction = 'credit' | 'debit';
export type TxnKind = 'payment' | 'refund' | 'reversal';
export type TxnStatus = 'success' | 'pending' | 'failed';
export type Confidence = 'high' | 'medium' | 'low';
export type SourceCategory = 'bank' | 'upi' | 'sms' | 'manual' | 'import';

/** PRD 9.2 transaction categories. */
export type TxnCategory =
  | 'received'
  | 'sent'
  | 'refund'
  | 'reversal'
  | 'pending'
  | 'failed'
  | 'informational'
  | 'unknown';

export type AnnounceStatus = 'announced' | 'skipped' | 'failed' | 'queued' | 'none';

/** A raw event as delivered by the native notification listener (or built by manual entry / share). */
export interface RawEvent {
  id: string;
  pkg: string;
  title: string;
  text: string;
  bigText?: string;
  subText?: string;
  postTime: number;
  key?: string;
  origin?: 'notification' | 'share' | 'simulated' | 'sms';
  /** Posted by the phone's default SMS app (any brand), as detected natively. */
  defaultSms?: boolean;
  /** Exact SMS originating address (origin 'sms', read via the SMS receiver — cannot be spoofed). */
  sender?: string;
  /** From the notification's MessagingStyle sender: e.g. "tel:+9198…" for a person. */
  personUri?: string;
}

export interface ParsedTxn {
  amount: number;
  direction?: Direction;
  kind: TxnKind;
  status: TxnStatus;
  bank?: string;
  last4?: string;
  sender?: string;
  beneficiary?: string;
  upiId?: string;
  reference?: string;
  informational: boolean;
  infoReason?: string;
  sourceId: string;
  sourceName: string;
  sourceCategory: SourceCategory;
  notes: string[];
}

export interface AnnounceInfo {
  status: AnnounceStatus;
  at?: number;
  lang?: Lang;
  text?: string;
  /** Offline English translation of `text` (same payment, English template). */
  textEn?: string;
  reason?: string;
  count: number;
}

export interface Txn {
  id: string;
  amount: number;
  direction: Direction | 'unknown';
  kind: TxnKind;
  status: TxnStatus;
  category: TxnCategory;
  confidence: Confidence;
  bank?: string;
  accountId?: string;
  last4?: string;
  sender?: string;
  beneficiary?: string;
  upiId?: string;
  reference?: string;
  timestamp: number;
  source: { id: string; name: string; category: SourceCategory; pkg?: string };
  unknownReason?: string;
  raw?: { title: string; text: string; hash: string; key?: string };
  announce: AnnounceInfo;
  /** User edits are kept apart from recognised evidence (PRD 13.3). */
  corrections?: { sender?: string; beneficiary?: string; accountId?: string; direction?: Direction };
  userCategory?: string;
  notes?: string;
  review?: boolean;
  /** Unknown-queue handling (PRD 18). */
  irrelevant?: boolean;
  excluded?: boolean;
  mergedEvents?: number;
  /** SMS only: the sender code and whether it is a recognised bank (only those may be announced). */
  smsSender?: string;
  senderTrust?: 'bank' | 'trusted' | 'unverified';
  createdAt: number;
  updatedAt: number;
}

export interface BankAccount {
  id: string;
  displayName: string;
  bank: string;
  last4?: string;
  type: 'savings' | 'current' | 'other';
  upiIds: string[];
  sources: string[];
  active: boolean;
  isDefault: boolean;
  color: number;
  createdAt: number;
}

export interface DiagEntry {
  id: string;
  at: number;
  pkg: string;
  title: string;
  snippet: string;
  decision:
    | 'new'
    | 'duplicate'
    | 'updated'
    | 'informational'
    | 'unparsed'
    | 'ignored-source'
    | 'announced'
    | 'announce-skipped'
    | 'announce-failed'
    | 'ignored-sender';
  detail?: string;
  txnId?: string;
}
