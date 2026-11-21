# RubyAlert brand kit

Every file here is generated from the master logo in `source/` (1024 px with transparent corners, and the original 1254 px). Don't edit the outputs by hand. Regenerate them from the master so every size stays identical.

## Colours

| Token | Hex | Use |
|---|---|---|
| Ruby | `#E0103A` | Brand colour, notification accent, light-mode primary |
| Ruby bright | `#FF2D55` | Dark-mode primary, buttons, active tab |
| Ruby light | `#FF7A8F` | Secondary accent, glows |
| Ruby deep | `#8A0626` | Gradient end, pressed states |
| Ruby night | `#2A0008` | Icon background, deepest surface |
| Brand gradient | `#FF5A6E → #E0103A → #8A0626` | Hero cards, the Soundbox button, About |
| Dark surface | `#0B0609` | App background (dark), launch screen |

The in-app scheme is **Ruby** (`src/theme/index.tsx`). It's the default, and existing installs move to it once. Users can still pick another scheme in Settings → Appearance.

## Files

| Folder | File | Where it's used |
|---|---|---|
| `store/` | `playstore-icon-512.png` | Google Play listing icon (Play applies its own mask) |
| | `appstore-icon-1024.png` | App Store (opaque, no rounding) |
| | `feature-graphic-1024x500.png` | Google Play feature graphic |
| `icon/` | `icon-rounded-1024.png`, `icon-circle-1024.png`, `icon-square-1024.png` | Website, social, documents |
| | `sizes/icon-16…512.png` | Favicons, small UI |
| | `adaptive-background/foreground/monochrome-1024.png` | Masters for the Android adaptive icon layers |
| `logo/` | `mark-color-transparent.png` | R + waves on transparent, for any background |
| | `mark-white-transparent.png`, `mark-black-transparent.png` | One-colour mark |
| | `wordmark-on-dark.png`, `wordmark-on-light.png` | "RubyAlert" lettering |
| | `lockup-on-dark.png`, `lockup-on-light.png` | Mark + wordmark side by side |

## In the apps

**Android** (`android/app/src/main/res`)
- `mipmap-anydpi-v26/ic_launcher*.xml`: adaptive icon (Android 8+) with background, foreground and monochrome layers. Monochrome is for Android 13 themed icons.
- `mipmap-*/ic_launcher.png`, `ic_launcher_round.png`: legacy launcher icons (Android 7).
- `drawable-*/ic_stat_rubyalert.png`: white status-bar icon for the "RubyAlert is live" notification, tinted ruby.
- `drawable-*/splash_icon.png`: Android 12+ system splash icon (`values-v31/styles.xml`).
- `drawable-*/splash_logo.png` with `drawable/launch_screen.xml`: launch window on Android 7–11.

**iOS** (`ios/SmartSoundbox/Images.xcassets`)
- `AppIcon.appiconset`: every iPhone size plus the 1024 marketing icon.
- `LaunchLogo.imageset`: the logo on `LaunchScreen.storyboard`.

**React Native** (`src/assets/brand`, at @1x/@2x/@3x, used through `src/components/Brand.tsx`)
- `AppIcon`: the icon tile. Used on Welcome, About, the lock screen, the Home compact header and the Settings footer.
- `BrandMark`: the colour or white mark. The white one is on the centre Soundbox button.
- `Wordmark`: the lettering. It switches automatically between the light and dark versions.
- `FullLogo`: the complete logo.

## Fixed identifiers

The display name is **RubyAlert** everywhere. The Android package (`com.smartsoundbox`) and the JS module name are unchanged, so existing installs update in place and keep their data.
