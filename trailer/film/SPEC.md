# RubyAlert: Life Before and After
GOAL: the viewer leaves knowing RubyAlert makes a phone say every payment out loud in Tamil, English or Hindi, offline.
OUTPUT: HyperFrames 1920x1080 @30fps. TIME: 58 s = 1740 frames. No music source (no HeyGen / ffmpeg): bundled SFX only.
LOOK: light grey ground #D9DCE1 (the old way), ruby #E0103A field (the new way), white #FFFFFF, ink #1A0B10. Accent ruby only on the new-way field, the verbs' underline and the end card. Inter 900 at 72-150 px, -2% tracking; Noto Sans Tamil / Devanagari 700 for the spoken lines. Medium: product UI rebuilt from source labels (Home: Today, Received, Sent, Recent), phone 430x880, 56 px radius. Shadow 0 30px 60px rgba(42,0,8,.35).
MOTION: enter power4.out 0.5 s; move power3.inOut 0.6 s; old side churns (jitter 0.12 s), new side calm (single 0.8 s moves).
SHOTS: 0-12 s split screen, left churns, right calm, left collapses at 9 s. 12-24 s phone announces in en/ta/hi, one line per 3.2 s. 24-44 s verbs Listens / Checks twice / Remembers / Exports, 5 s each, phone swaps screens by wipe. 44-49 s claim "Nothing leaves this phone." 49-58 s end card: white iris, mark lands, wordmark wipes, CTA, hold 3 s.
BANNED: dark void, glow, particles, glass cards, three-card rows, docked logo, centered-everything, fade-slide-up on everything, real app brand names in fake notifications.
QA: frame 0 (split with content), 10.5 s (collapse mid), 17 s (Tamil line), 34 s (dedupe), 56 s (end card).
