# Smart Soundbox

Offline-first React Native (bare, no Expo) app that turns a phone into a payment soundbox:
it reads supported bank/UPI/SMS payment notifications, recognises the transaction, prevents
duplicate announcements, speaks it in Tamil / English / Hindi, keeps history and exports
Excel/CSV reports.

## Run

```bash
npm install
npx react-native run-android     # device or emulator
npm test                         # parser, number-words, dedup tests
```

After install: open the app → onboarding → grant **Notification access** (and allow
background running). Use **Settings → Try with sample payments** to test without real money.

Release APK: `cd android && gradlew assembleRelease` (sign with your own keystore first;
`android/app/build.gradle` still uses the debug key).

## How it works

```
Payment app notification
  └─ SoundboxListenerService.kt   filters watched apps + money-looking text, buffers to disk
       └─ HeadlessStarter          wakes JS (headless task "SoundboxEvent"), even if app is closed
            └─ engine/service.ts   drains buffer
                 └─ processor.ts   source check → parser → account match → confidence → dedupe → store
                      └─ announcer.ts  queue (credits first) → chime → native TTS → status
```

| Folder | What |
|---|---|
| `android/.../soundbox/` | Notification listener, durable event buffer, TTS engine (voices, pitch, rate, ducking, volume boost), synthesised chimes, file save/share, CSV picker, biometric lock |
| `src/engine/` | `parser` (amount, credit/debit, refund/reversal, pending/failed, last-4, UTR, UPI ID, sender/beneficiary), `dedupe`, `numberWords` (Indian numbering in ta/en/hi), `templates`, `processor`, `announcer` |
| `src/store/` | MMKV-backed zustand stores (settings, transactions, accounts, diagnostics) |
| `src/screens/` | Onboarding, Home, History, Reports, Settings, Voice Studio, Accounts, Sources, Review queue, Manual entry, Import, Diagnostics, Appearance, Announcement rules, Privacy, Daily closing, Simulator |
| `src/components/` | Animated UI kit (spring press, counters, slider, segmented, sheet, charts, waveform) |

## Notes & limits

- **Architecture**: runs on the classic RN architecture (`newArchEnabled=false`) for reliable headless tasks.
- **SMS**: bank SMS are read from the Messages app's *notification*, so no `READ_SMS` permission is required.
- **Voices**: the app uses the phone's speech engine. Install offline Tamil/Hindi voice data in
  Voice Studio → "System speech settings" for best results. Personas are pitch/speed tunings on top of these voices.
- **iOS**: iOS cannot read other apps' notifications. Add `ios/SmartSoundbox/SoundboxNative.m` to the
  Xcode target for speech; the app then works in manual / paste / import mode. Run `cd ios && pod install`.
- Supported formats are best-effort; unrecognised alerts land in the Review queue, never silently dropped.
- The app reads notifications — it does **not** verify payments with the bank.
