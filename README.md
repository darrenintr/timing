# Timing

A local-first school schedule prototype for an S6 student in class 6B. It includes the printed A–F dates from the supplied September 2026 to February 2027 calendar and the personal subjects Economics (X1), Geography (X2), and ICT (X3).

## Run

Requires Node.js 20 or newer for tests and Python 3 for the local server. Run `npm run dev` and open `http://localhost:5173`. Use `npm test` for the schedule rules. The repository is a static site and needs no build step. Host it over HTTPS, then install it from a supported browser to use the offline PWA on iPad, Android, or Ubuntu.

## Native packages

The [Build installable packages](.github/workflows/packages.yml) workflow runs on every push to `main` and can also be started manually from GitHub Actions. Once all four jobs succeed, it creates a prerelease with direct downloads for each file. Each job also provides an Actions artifact:

| Platform | Artifact | Notes |
| --- | --- | --- |
| Android | `Timing-Android-APK` | Debug-signed APK for direct installation; not a Play Store release build. |
| Windows | `Timing-Windows-EXE` | Portable x64 EXE; Windows may warn because it is not code-signed. |
| Ubuntu | `Timing-Ubuntu-DEB` | x64 DEB package. |
| iPhone/iPad | `Timing-iOS-unsigned-IPA` | Unsigned compilation artifact; **cannot be installed on a normal device** without Apple signing and provisioning. |

The mobile projects are generated in CI with Capacitor from the `www/` assets. The desktop packages use Electron. For local packaging, run `npm install`, `npm run package:web`, then `npx cap add android` / `npx cap add ios` with the matching platform SDK, or `npm run package:windows` / `npm run package:linux` on the matching OS. Native signing, widgets, and system notifications are not implemented yet.

## Calendar rules

- The published cycle letter for each date is authoritative. Some dates repeat or jump, so a simple six-day counter would be wrong.
- School events and S6 tests or mock examinations with unknown lesson arrangements do not create ordinary lessons. Enter the special timetable when the school publishes it.
- Lessons stop after the S6 last school day on 1 February 2027, even though the school calendar continues for other year groups.
- Homework stores a subject and the day it was assigned. The due lesson is recomputed when a date is marked as no school, restored to normal, or given another cycle letter.
- Winter and summer lesson times can be selected manually because the supplied timetable does not give the changeover date.
- Data lives in this browser's local storage and, after signing in with Google, is also synced through Firestore (see **Sync**). Exporting `.ics` is a one-time calendar import; it does not update earlier imports automatically. Native widgets, notifications, and live Google/Apple Calendar synchronization are future platform integrations.

## Homework

Open the **Homework** tab in the top bar, or use **+ Add** under Today's lessons. A lesson row also has a small subject-specific **+** button. Each assignment can be edited, marked complete, removed, given notes, and broken into smaller steps.

**Next lesson** stores the subject and assigned date as a rule. Cancelling or rescheduling a school day recalculates the due lesson. **Specific date** keeps a fixed deadline for work that is not tied to a lesson. Due states show today, overdue, unconfirmed, and completed. Calendar export includes alarms at the selected reminder offset; export again after a timetable change. The app itself does not yet send reliable background notifications.

Source: user-supplied school calendar screenshots and 6B class timetable. Verify transcribed exceptions with the school before using them for critical deadlines.

## Sync

Settings → **Sign in with Google** keeps homework, day overrides and the summer/winter setting the same on every device signed in with the same account. It works offline: edits are kept on the device and uploaded when the connection returns.

- `src/sync-model.js` holds the pure rules (tested in `test/sync-model.test.js`): each homework item, day override and the lesson-time setting carries the time of its last change, the newer copy wins record by record, and deleted homework leaves a small marker so another device cannot bring it back. Timestamps come from each device's clock.
- `src/sync.js` talks to Firebase. Cloud layout: `users/{uid}/homework/{id}`, `users/{uid}/overrides/{date}`, `users/{uid}/meta/settings`. `firestore.rules` limits every account to its own documents; paste it into Firestore → Rules after changing it.
- `src/firebase-config.js` identifies the Firebase project (public values, not secrets). `src/vendor/firebase.js` is the bundled Firebase SDK so the app still needs no build step; rebuild it with `npm install && npm run vendor:firebase`.
- The web version is published to GitHub Pages by [Publish web app](.github/workflows/pages.yml) on every push to `main`. Its domain must be listed under Firebase → Authentication → Settings → Authorized domains. Bump `CACHE` in `sw.js` when shipping changes, or installed copies keep the old files.
- Google sign-in in the Android, iOS and desktop packages is not implemented yet (Google blocks its sign-in page inside embedded app views). Those builds show that sync is unavailable and keep working locally.

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
