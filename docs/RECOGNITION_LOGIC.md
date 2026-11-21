# How Smart Soundbox reads a notification

This explains, step by step, how a notification goes from "posted on the phone" to "announced and saved" — and every point where it can be rejected or sent to the Review queue instead. Line references point at the real code so you can jump straight to the logic.

```
Notification posted
  │
  ▼
┌───────────────────────────────────────────────┐
│ 1. Native filter (Kotlin, on-device, instant)  │  SoundboxListenerService.kt
└───────────────────────────────────────────────┘
  │ passes → buffered to disk, JS woken up
  ▼
┌───────────────────────────────────────────────┐
│ 2. Source check (JS)                           │  processor.ts → processEvent()
└───────────────────────────────────────────────┘
  │ passes
  ▼
┌───────────────────────────────────────────────┐
│ 3. Parsing (JS)                                │  parser.ts → parseEvent()
└───────────────────────────────────────────────┘
  │ valid transaction
  ▼
┌───────────────────────────────────────────────┐
│ 4. Account matching                            │  processor.ts → matchAccount()
├───────────────────────────────────────────────┤
│ 5. Duplicate check                             │  dedupe.ts → checkDuplicate()
├───────────────────────────────────────────────┤
│ 6. Confidence & category                       │  processor.ts → confidenceOf() / categoryOf()
└───────────────────────────────────────────────┘
  │ saved to History
  ▼
┌───────────────────────────────────────────────┐
│ 7. Announcement decision                       │  announcer.ts → skipReason()
└───────────────────────────────────────────────┘
  │
  ▼
Spoken aloud, or left silent with a logged reason
```

Every step writes one line to **Settings → Diagnostics** (`decision`, `detail`). That log is the fastest way to see exactly where a specific message stopped.

---

## 1. Native filter — `SoundboxListenerService.kt`

Runs the instant any app posts a notification, before Smart Soundbox's JS code is even involved.

1. **Ignore our own notifications** and grouped notification summaries.
2. **Must look like money.** The combined title + text + big-text + SMS body must match:
   ```
   ₹ | rs | inr | rupees | credited | debited | रुपये | ரூபாய்
   ```
   Anything that doesn't mention a currency word or "credited"/"debited" is dropped here — a chat message, a promo banner, an app update notice never leaves the phone's notification shade as far as Smart Soundbox is concerned.
3. **Must be from a watched app**, unless **Capture other apps** is on (Settings → Payment sources → Advanced). Watched apps = the ones toggled on in Payment sources (GPay, PhonePe, Paytm, BHIM, bank apps), **plus the phone's default SMS app, whatever brand it is** (detected with Android's `Telephony.Sms.getDefaultSmsPackage`, re-checked every minute), as long as the "Bank SMS" source is on. Such events are tagged `defaultSms` so the JS side treats them as the SMS source too.

   Anything skipped at this step **is recorded** in Settings → Diagnostics → *Skipped by listener*, with the app's package and the reason:
   - *App not in Payment sources*: a payment-looking alert from an app you haven't enabled.
   - *Content hidden by Android*: a watched app's notification arrived with its text redacted (Android 15+ can hide content from third-party listeners).
4. **Native duplicate guard**: the exact same title+text from the exact same app posted again within 4 seconds is dropped immediately (some apps repost a notification to update it).

If it survives all four checks, it's saved to a small on-disk buffer and the app's background JS is woken up (even if the app was fully closed).

---

## 1b. Bank SMS only: sender code check (`senders.ts`, `SmsReceiver.kt`)

**Only SMS from a bank sender code can make a sound.** It's decided from *who sent it*, never from the text, because a friend's SMS can mention "HDFC" too.

Indian business SMS carry a TRAI/DLT sender code, e.g. **`JM-HDFCBK-S`**:

| Part | Meaning | Used for |
|---|---|---|
| `JM` | operator + telecom circle | ignored |
| `HDFCBK` | 6-char header registered by the bank | **identifies the bank** |
| `-S` / `-T` | service / transactional | accepted |
| `-P` / `-G` | promotional / government | rejected |

**How a bank SMS reaches you, and why the code varies**

1. The bank registers on the DLT platform (Jio/Airtel/Vi/BSNL) as a *principal entity*. It registers one or more **6-character headers** (a bank usually has several: e.g. SBIINB, SBIUPI, ATMSBI) and fixed message **templates**.
2. It sends through an SMS aggregator. The operator checks the header and template against DLT.
3. The phone receives `XY-HEADER-C`. The `XY` prefix depends on the operator/circle route, so **it changes from message to message** (`JM-TMBANK-S`, `SL-TMBANK`, `AD-TMBANK-T`). Phones may also show it undashed (`JMTMBANK`) or just as `TMBANK`. The `-C` category is newer and sometimes missing.

So the full code can't be predefined, and even the header differs between a bank's registrations. The **stable part is the bank stem** that all its headers share (`TMB`, `HDFC`, `SBI`, `KVB`, `CUB`, `IOB`…). Matching therefore:
- ignores the `XY` prefix and the `-C` ending, in any of the displayed forms;
- matches **exact headers** (built-in list) or **stems** (trust `TMB` = every code starting with TMB);
- **auto-verifies** an unknown header that has a bank stem *and* whose SMS names one of your configured account numbers (e.g. "A/c XX7003"). Two independent signals, so it's announced, and the header is remembered for next time. With only the stem, it's held silently in the Review queue as "looks like TMB".

**How to add your bank:** Settings → Payment sources → Bank SMS senders → type just the bank part (`TMB`) to trust every code it uses, or a full code (`TMBANK` / `JM-TMBANK-S`) to trust exactly one. Codes that sent payment SMS but aren't trusted yet appear there with a one-tap **Trust** button.

**Where the sender comes from**
- **Verify SMS sender** (Settings → Payment sources → Bank SMS senders; on by default; needs the SMS permission): `SmsReceiver.kt` reads each incoming SMS directly, so the sender is the real originating address and can't be faked by a contact name. While this is active, the SMS app's own notification is skipped so nothing is processed twice.
- **Fallback** (permission not granted): the sender shown in the SMS app's notification. If the notification says the message came from a `tel:` number, it's treated as a person.

**Classification** (`classifySender`)

| Sender | Result |
|---|---|
| Phone number (`+91…`, `98…`), or a contact name (`Ramesh`, `Amma`, `HDFC Bank`) | **Ignored**: not stored. Diagnostics logs only "From +91…", never the message text. |
| `…-P` promotional / `…-G` government | **Ignored** |
| Built-in bank code (about 60, e.g. HDFCBK, SBIINB, SBIUPI, ICICIB, AXISBK, KOTAKB, CANBNK, IOBCHN, KVBANK, CUBANK, TMBANK…) or a code you trusted | **Bank**: processed normally and **announced**. The bank name comes from the code. |
| Any other valid business code (e.g. a co-operative bank not in the list) | **Held silently**: saved to the Review queue, not counted in totals, **no sound**. Tap **"Trust … as my bank"** to accept it from then on. |

UPI app notifications (GPay, PhonePe, Paytm…) aren't SMS and are unaffected.

## 2. Source check — `processor.ts: processEvent()`

Re-checks the source now that JS is running, using your current Settings (the native side only syncs periodically):

- If the app is a **known source but you turned its toggle off** → `ignored-source`, logged with "*App name* is disabled".
- If the app is **unknown and "Capture other apps" is off** → `ignored-source`, logged "App is not a supported source".

This is also where the toggle actually matters — the native filter already let it through because it mentioned money; this is the JS-side gate.

## 3. Parsing — `parser.ts: parseEvent()`

The real recognizer. Works on `title + text + subText` glued together (the "big text" expansion of the notification is preferred when it's longer, since that's the full SMS body).

**What makes a message valid:**

| Step | Logic | If it fails |
|---|---|---|
| **Amount** | Looks for `₹123`, `Rs.123`, `INR 123`, `123 rupees`, or `debited by 123` / `credited with 123`. Numbers right after "balance", "limit", "available", "outstanding", "due", "cashback up to" are skipped (they're not the transaction amount). | amount stays empty |
| **Direction** | Scans for credit words (*received, credited, deposited, paid you, money in*, Tamil/Hindi equivalents) and debit words (*debited, spent, withdrawn, paid, trf to, money out*, …) and takes whichever appears **first** in the text. | direction stays empty |
| **No amount AND no direction** | → returns `null` entirely | logged as `unparsed`: "No amount or transaction keywords" |

If at least one of amount/direction was found, it keeps going and classifies the message:

- **OTP/verification code** → informational, never a transaction.
- **"X has requested ₹Y"** without the words credited/debited → informational (a request isn't a payment).
- **Balance update** (no direction + "available balance…") → informational.
- **Promotional** (no direction + offer/loan/EMI/KYC/bill-due wording) → informational.
- (SMS sender checks happen before parsing; see section 1b.)

Informational messages are logged but **never turned into a transaction or announced** — this is what keeps OTPs and "you have a bill due" texts out of your history.

**What's extracted once it's accepted as a real transaction:**
- **Bank name** — matched against ~20 known Indian banks (HDFC, SBI, ICICI, Axis, Kotak, PNB, …) by name or DLT sender-ID stem (e.g. `hdfcbk`, `sbiinb`).
- **Last 4 account digits** — from patterns like "A/c XX1234" or "Account ending 1234".
- **Reference number (UTR/RRN)** — from "UPI Ref No …", "UTR …", "Txn ID …", or a bare UPI reference after the word "UPI".
- **UPI ID** — any `name@bank` pattern in the text.
- **Sender/beneficiary name** — several patterns, e.g. "X paid you", "received from X", "credited by VPA x@y NAME", "paid to X". Names are cleaned (title-cased, trailing punctuation stripped) and rejected if they're too short/long, mostly digits, a known bank name, or a stray keyword like "UPI"/"A/C"/"customer".
- **Status** — `pending` or `failed` if those words appear, otherwise `success`. A **pending or failed transaction is never later announced as a successful payment.**
- **Kind** — `refund` or `reversal` if those words appear (forces direction to credit), otherwise `payment`.

If any of bank / reference / amount / direction couldn't be found, that's recorded as a note (used later to explain why a transaction needs review).

## 4. Account matching — `processor.ts: matchAccount()`

Tries these in order, and **stops at the first one that uniquely identifies an account** — it never guesses when there's ambiguity:

1. **Account digits match exactly one of your accounts** → strong match. If the alert's digits match *more than one* account, or match *none* of your accounts (even if there's only one HDFC account), it's left unassigned rather than guessed — this is deliberate, so a stray "xx9999" never gets pinned on your "xx1234" account.
2. **UPI ID matches one of your saved UPI IDs** → strong match.
3. **Only one of your accounts is linked to the app this came from** (Settings → Bank accounts → "Apps that pay into this account") → linked match.
4. **Only one of your accounts is with that bank at all** → bank-only match (weaker — used only when the alert carries no digits to check against).
5. Otherwise → **unassigned**. Never falls back to your default account on an uncertain match.

## 5. Duplicate check — `dedupe.ts: checkDuplicate()`

Compares against the last 3 days of transactions, in this priority order:

1. **Same reference number** (and same amount/kind) → duplicate. If the new one has a *more final* status (pending→success, pending→failed) → updates the existing record instead of creating a new one.
2. **Identical notification text re-posted** within 30 minutes → duplicate.
3. **Pending, then success/failure from the same app**, same amount, within an hour → updates the existing pending record (so it flips from "pending" to "received" in place, and gets announced *then*, not before).
4. **A late "pending" notice arriving after the real result** → duplicate (ignored).
5. **Same amount reported by two different apps** (e.g. your bank's SMS and GPay) within 3 minutes, same kind, compatible sender name → duplicate — this is what prevents hearing "₹500 received" twice for one payment.

Two different payments of the same amount from the same app, a minute apart, are **not** merged — each is kept as its own transaction.

## 6. Confidence & category

- **High** confidence: known source, strong/linked account match, and a reference number or bank name present.
- **Medium**: everything recognized but one of those is missing, or the source was captured via "Capture other apps".
- **Low**: amount or direction couldn't be determined at all.

Category is one of: `received`, `sent`, `refund`, `reversal`, `pending`, `failed`, or `unknown` (unknown = no amount/direction — these always land in the Review queue).

## 7. Announcement decision — `announcer.ts: skipReason()`

Even a fully recognized, saved transaction may still be **silent**, for any of these reasons (all logged):

- Soundbox switched off, or paused.
- Inside your configured quiet hours.
- Status is `pending` or `failed` (never announced as a success).
- Category is `unknown`.
- Confidence is `low` and "Announce low-confidence alerts" is off.
- Below your configured minimum amount.
- Matched to an account you marked inactive.
- Unassigned and "Announce when account is unknown" is off.
- That transaction type (credit/debit/refund/reversal) is toggled off in Announcement rules.

If none of those apply, it's queued, a chime plays, and the amount is spoken in your chosen language/voice — falling back to English automatically if that language's voice isn't available on the device.

---

## Debugging a specific message

1. **Settings → Diagnostics** — find the event and read its `decision`:
   - Listed under **Skipped by listener** → stopped at step 1; the reason tells you what to change.
   - *(nothing logged anywhere)* → the notification never reached the app at all (the OS probably killed it in the background; check Autostart/battery settings for your phone's brand).
   - `ignored-source` → source toggle off, or unknown app with "Capture other apps" off.
   - `unparsed` → no amount or credit/debit keyword found in the text.
   - `informational` → recognized but deliberately not a transaction (OTP, request, balance, promo).
   - `new` → became a transaction. Check its confidence/account match in History.
   - `duplicate` / `updated` → matched against something already recorded.
2. If it's `new` but silent, open the transaction in **History** and check the **Announcement** section — it shows the exact skip reason.
