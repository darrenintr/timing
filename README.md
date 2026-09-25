# Timing

A local-first school schedule prototype for an S6 student in class 6B. It includes the printed A–F dates from the supplied September 2026 to February 2027 calendar and the personal subjects Economics (X1), Geography (X2), and ICT (X3).

## Run

Requires Node.js 20 or newer for tests and Python 3 for the local server. Run `npm ci`, then `npm run dev` and open `http://localhost:5173`. Use `npm test` for the schedule and sync rules. `npm run package:web` bundles the static site into `www/`. Host those assets over HTTPS, then install the PWA from a supported browser.

## Native packages

The [Build installable packages](.github/workflows/packages.yml) workflow runs on every push to `main` and can also be started manually from GitHub Actions. Once all four jobs succeed, it creates a prerelease with direct downloads for each file. Each job also provides an Actions artifact:

| Platform | Artifact | Notes |
| --- | --- | --- |
| Android | `Timing-Android-APK` | Debug-signed APK for direct installation; not a Play Store release build. |
| Windows | `Timing-Windows-EXE` | Portable x64 EXE; Windows may warn because it is not code-signed. |
| Ubuntu | `Timing-Ubuntu-DEB` | x64 DEB package. |
| iPhone/iPad | `Timing-iOS-unsigned-IPA` | Unsigned compilation artifact; **cannot be installed on a normal device** without Apple signing and provisioning. |

The mobile projects are generated in CI with Capacitor from the `www/` assets. The desktop packages use Electron. For local packaging, run `npm ci`, `npm run package:web`, `python3 scripts/configure-native.py prepare-android` / `prepare-ios`, then `npx cap add android` / `npx cap add ios` with the matching platform SDK and `python3 scripts/configure-native.py android` / `ios` after adding each platform. If Firebase is configured, rerun `pod install` inside `ios/App` after removing its generated `Podfile.lock`. Or run `npm run package:windows` / `npm run package:linux` on the matching OS. Native signing, widgets, and system notifications are not implemented yet.

## Google account sync setup

The header has **Sign in with Google**. Homework, smaller steps, school-day overrides, and summer/winter lesson times synchronize by Firebase account; the underlying school calendar stays bundled in the app. It keeps an offline copy and merges existing local work on first sign-in. The app cannot complete a Google login until a Firebase project is connected; no project credentials are bundled with this public repository.

1. Create a Firebase project, register a Web app and Android/iOS apps with the ID `io.github.darrenintr.timing`, enable **Authentication → Google**, and create a **Cloud Firestore** database. Deploy the owner-only rules in [`firestore.rules`](firestore.rules). Add the hosted PWA's domain to Firebase Authentication's authorized domains.
2. Set the repository Actions variable `TIMING_FIREBASE_CONFIG` to the public Web app JSON config, e.g. `{"apiKey":"...","authDomain":"...firebaseapp.com","projectId":"...","appId":"..."}`. Locally, pass the same JSON environment variable to `npm run package:web`. These are public client settings, not a service-account key.
3. For Android CI, set the secret `TIMING_FIREBASE_ANDROID_JSON_BASE64` to the base64 contents of the Android app's `google-services.json`. Register the **actual APK signing key's** SHA-1 in Firebase; the default CI debug key is ephemeral, so a persistent signing key is needed for Google login across CI builds.
4. For iOS CI, set `TIMING_FIREBASE_IOS_PLIST_BASE64` to the base64 contents of `GoogleService-Info.plist` for the iOS app. The build script includes the plist and its reversed client ID URL scheme. The IPA is still unsigned and needs Apple signing before installation.

If a native project file is missing while the Web config is supplied, its CI job fails rather than publishing a package with broken native sign-in. A package built without any Firebase config excludes the native Firebase plugin (which requires a plist at launch), still works locally, and shows the setup status instead of pretending to sync. Desktop packages use a custom app scheme and cannot complete Firebase's browser popup flow; use the HTTPS PWA for Google sign-in there. Google account sync is distinct from live Google Calendar integration; calendar `.ics` exports still require importing again after changes.

## Calendar rules

- The published cycle letter for each date is authoritative. Some dates repeat or jump, so a simple six-day counter would be wrong.
- School events and S6 tests or mock examinations with unknown lesson arrangements do not create ordinary lessons. Enter the special timetable when the school publishes it.
- Lessons stop after the S6 last school day on 1 February 2027, even though the school calendar continues for other year groups.
- Homework stores a subject and the day it was assigned. The due lesson is recomputed when a date is marked as no school, restored to normal, or given another cycle letter.
- Winter and summer lesson times can be selected manually because the supplied timetable does not give the changeover date.
- Data is kept locally and, when a Firebase project is configured and you sign in, in your account's Firestore document. Exporting `.ics` is a one-time calendar import; it does not update earlier imports automatically. Native widgets, notifications, and live Google/Apple Calendar synchronization are future platform integrations.

## Homework

Open the **Homework** tab in the top bar, or use **+ Add homework** on the schedule screen. The tab shows the form first, followed by open, completed, and subject filters. A lesson row also has a subject-specific add button. Each assignment can be edited, marked complete, removed, given notes, and broken into smaller steps.

**Next lesson** stores the subject and assigned date as a rule. Cancelling or rescheduling a school day recalculates the due lesson. **Specific date** keeps the selected date and uses the first lesson of that subject on that day, including its period and start time in the calendar export. If no confirmed subject lesson exists that day, the date stays fixed with a 5:00 PM fallback. Timetable overrides update the period without moving the date. Due states show today, overdue, unconfirmed, and completed. Calendar export includes alarms at the selected reminder offset; export again after a timetable change. The app itself does not yet send reliable background notifications.

Source: user-supplied school calendar screenshots and 6B class timetable. Verify transcribed exceptions with the school before using them for critical deadlines.
