# Timing

A local-first school schedule prototype for an S6 student in class 6B. It includes the printed A–F dates from the supplied September 2026 to February 2027 calendar and the personal subjects Economics (X1), Geography (X2), and ICT (X3).

## Run

Requires Node.js 20 or newer for tests and Python 3 for the local server. Run `npm ci`, then `npm run dev` and open `http://localhost:5173`. Use `npm test` for the schedule and sync rules. `npm run package:web` bundles the static site into `www/`. Host those assets over HTTPS, then install the PWA from a supported browser.

## Native packages

The [Build installable packages](.github/workflows/packages.yml) workflow runs on every push to `main` and can also be started manually from GitHub Actions. Once all four jobs succeed, it creates a prerelease with direct downloads for each file. Each job also provides an Actions artifact:

| Platform | Artifact | Notes |
| --- | --- | --- |
| Android | `Timing-Android-APK` | Debug APK by default; release signed with a stable key when `ANDROID_KEYSTORE_*` secrets are configured. Its SHA-1 must match Firebase for Google sign-in. |
| Windows | `Timing-Windows-EXE` | Portable x64 EXE; Windows may warn because it is not code-signed. |
| Ubuntu | `Timing-Ubuntu-DEB` | x64 DEB package. |
| iPhone/iPad | `Timing-iOS-unsigned-IPA` | Unsigned compilation artifact; **cannot be installed on a normal device** without Apple signing and provisioning. |

The mobile projects are generated in CI with Capacitor from the `www/` assets. The desktop packages use Electron. For local packaging, run `npm ci`, `npm run package:web`, `python3 scripts/configure-native.py prepare-android` / `prepare-ios`, then `npx cap add android` / `npx cap add ios` with the matching platform SDK. Run `python3 scripts/configure-native.py android` and `python3 scripts/install-android-widget.py` for Android; run `python3 scripts/configure-native.py ios` and `ruby scripts/install-ios-widget.rb` for iOS. If Firebase is configured, rerun `pod install` inside `ios/App` after removing its generated `Podfile.lock`. Or run `npm run package:windows` / `npm run package:linux` on the matching OS. Native signing and system notifications still need separate setup.

### Widgets

Android and iOS packages include a family of home-screen widgets and the Timing launcher icon, following the widget design (Today view reduced to a glance: hairlines instead of cards, the three type voices, colour only where it means something). Launch the app once after installing it, then add widgets from your device's widget picker.

| Platform | Widget | Size | Shows |
| --- | --- | --- | --- |
| iPhone · iPad | Now | small | Cycle day, current lesson, minutes left, progress, what's next |
| iPhone · iPad | Due next | small | Open homework count, next three with overdue / today first |
| iPhone · iPad | Today | medium · large · extra large (iPad) | Now plus the next lessons; the whole day with homework you can tick off; iPad adds a three-column day overview |
| iPhone | Lock Screen | circular · rectangular · inline | Cycle letter with lesson progress, homework count, current lesson and next room |
| Android | Now | 2×2 | Cycle letter in the Expressive cookie, current lesson, wavy progress |
| Android | Homework count · Next lesson | 2×1 | Open homework in the burst with overdue flagged; the next lesson and room |
| Android | Today | 4×2 → 4×4 | Next four lessons; at 4×3 the whole day; at 4×4 homework with 44 dp check targets |
| Android | Timeline · Homework · Next school day | 6×2 · 4×3 · 3×2 | The day left to right, filling as lessons run; homework grouped by due; the next school day's letter and first lesson |

Every widget reads the same snapshot (`src/widget-data.js`) in Hong Kong time: the printed cycle letter, lesson times, rooms and teachers, day notices and open homework with its recalculated due lesson. They redraw at each period boundary (and each minute during school hours) and at midnight, so they stay correct while the app is closed. Tests, events and holidays show the school's notice instead of lessons, never a guessed timetable; after 1 February they say S6 has finished. Both light and dark follow the system.

Tapping a widget opens Today; a homework row opens that assignment and **Add** opens the homework form (via `timing://` links). The check circle completes homework in place (an App Intent on iOS 17+, a broadcast on Android); the app collects those check-offs next time it opens and syncs them. iOS widgets need iOS 17 or later; the app itself keeps Capacitor's minimum. The widgets use the system serif and monospace faces as stand-ins for Fraunces and JetBrains Mono, because widget processes cannot load the bundled web fonts.

The iOS widgets use the `group.io.github.darrenintr.timing` App Group in both the app and extension: device signing must provision this group for both bundle IDs (`io.github.darrenintr.timing` and `io.github.darrenintr.timing.widget`). The CI IPA remains unsigned and needs both targets signed together for installation.

## Google account sync setup

The header has **Sign in with Google**. Homework, smaller steps, school-day overrides, and summer/winter lesson times synchronize by Firebase account; the underlying school calendar stays bundled in the app. It keeps an offline copy and merges existing local work on first sign-in. The repository's own Firebase project (`timing-49c6d`) is committed as public client settings in `src/firebase-config.js`, `GoogleService-Info.plist` and `google-services.json`; every build uses it unless the settings below override it. Set `TIMING_FIREBASE_CONFIG` to `{}` for a local-only build.

1. Create a Firebase project, register a Web app and Android/iOS apps with the ID `io.github.darrenintr.timing`, enable **Authentication → Google**, and create a **Cloud Firestore** database. Deploy the owner-only rules in [`firestore.rules`](firestore.rules). Add the hosted PWA's domain to Firebase Authentication's authorized domains.
2. Set the repository Actions variable `TIMING_FIREBASE_CONFIG` to the public Web app JSON config, e.g. `{"apiKey":"...","authDomain":"...firebaseapp.com","projectId":"...","appId":"..."}`. Locally, pass the same JSON environment variable to `npm run package:web`. These are public client settings, not a service-account key.
3. For Android CI, set the secret `TIMING_FIREBASE_ANDROID_JSON_BASE64` to the base64 contents of the Android app's `google-services.json`. For stable Google sign-in across releases, set `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS` and `ANDROID_KEY_PASSWORD` and register that key's SHA-1 in Firebase. The signed build checks the SHA-1. Without a release key the workflow publishes a debug APK.
4. For iOS CI, set `TIMING_FIREBASE_IOS_PLIST_BASE64` to the base64 contents of `GoogleService-Info.plist` for the iOS app. The build script includes the plist and its reversed client ID URL scheme. The IPA is still unsigned and needs Apple signing before installation.

If a native project file is missing while the Web config is supplied, its CI job fails rather than publishing a package with broken native sign-in. A package built without any Firebase config excludes the native Firebase plugin (which requires a plist at launch), still works locally, and shows the setup status instead of pretending to sync. Desktop packages use a custom app scheme and cannot complete Firebase's browser popup flow; use the HTTPS PWA for Google sign-in there. Google account sync is distinct from live Google Calendar integration; calendar `.ics` exports still require importing again after changes.

## Calendar rules

- The published cycle letter for each date is authoritative. Some dates repeat or jump, so a simple six-day counter would be wrong.
- School events and S6 tests or mock examinations with unknown lesson arrangements do not create ordinary lessons. Enter the special timetable when the school publishes it.
- Lessons stop after the S6 last school day on 1 February 2027, even though the school calendar continues for other year groups.
- Homework stores a subject and the day it was assigned. The due lesson is recomputed when a date is marked as no school, restored to normal, or given another cycle letter.
- Winter and summer lesson times can be selected manually because the supplied timetable does not give the changeover date.
- Data is kept locally and, when a Firebase project is configured and you sign in, in your account's Firestore document. Exporting `.ics` is a one-time calendar import; it does not update earlier imports automatically. Notifications and live Google/Apple Calendar synchronization are future platform integrations.

## Homework

Open the **Homework** tab in the top bar, or use **+ Add** under Today's lessons. A lesson row also has a small subject-specific **+** button. Each assignment can be edited, marked complete, removed, given notes, and broken into smaller steps.

**Next lesson** stores the subject and assigned date as a rule. Cancelling or rescheduling a school day recalculates the due lesson. **Specific date** keeps the selected date and uses the first lesson of that subject on that day, including its period and start time in the calendar export. If no confirmed subject lesson exists that day, the date stays fixed with a 5:00 PM fallback. Timetable overrides update the period without moving the date. Due states show today, overdue, unconfirmed, and completed. Calendar export includes alarms at the selected reminder offset; export again after a timetable change. The app itself does not yet send reliable background notifications.

Source: user-supplied school calendar screenshots and 6B class timetable. Verify transcribed exceptions with the school before using them for critical deadlines.

## Sync

Settings → **Sign in with Google** keeps homework, day overrides and the summer/winter setting the same on every device signed in with the same account. It works offline: edits are kept on the device and uploaded when the connection returns.

- `src/sync-data.js` merges local changes record by record and retains deletion markers; `src/cloud.js` signs in and synchronizes the document at `timingUsers/{uid}/data/s6`. The accompanying `firestore.rules` restrict access to each account's own document.
- Firebase Web configuration is provided through the `TIMING_FIREBASE_CONFIG` Actions variable or local environment variable. The public Firebase project files on the feature branch are reference material; CI includes the native plugin only when matching Web and native configuration are provided. Desktop packages remain local because the Electron app scheme cannot complete Firebase popup sign-in.
- The web version is published to GitHub Pages by [Publish web app](.github/workflows/pages.yml) on pushes to `main`. Add its domain to Firebase Authentication's authorized domains. The service worker cache version in `sw.js` must change with a release.

## Design

The interface is deliberately quiet: one centred column, hairline dividers instead of cards, and three type families that carry the hierarchy instead of boxes and colour blocks.

- **Fraunces** (serif) for headlines and whatever matters right now: the day name, the current lesson, the cycle day in italic.
- **Roboto Flex** (sans) for reading text and controls, using weight (400 → 750) and small tracked capitals for section labels.
- **JetBrains Mono** for things you scan in a column: times, rooms, teachers, periods.

Colour is kept to meaning: teal for the cycle day and "now", terracotta for notices and things due today, red for overdue. It follows the system light or dark setting.

The top bar has three views (Today, Calendar, Homework) and a settings button. Less frequent controls live one layer deeper:

- **Settings:** summer or winter lesson times, overriding a day's status or cycle letter, calendar export, and notes about the data.
- **Homework:** the add form is folded behind **+ Add homework**; reminders and notes are folded again inside it; each assignment's steps, notes, edit and delete sit behind its own disclosure.

Fonts are bundled in `src/fonts` under the SIL Open Font License (Roboto Flex, Fraunces, JetBrains Mono). Material Symbols Rounded paths (`src/icons.js`) are under the Apache License 2.0. The app icon is available as `icon.svg`, `icon-maskable.svg` and `icon-monochrome.svg`.
