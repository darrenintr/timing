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
- Data lives in this browser's local storage. Exporting `.ics` is a one-time calendar import; it does not update earlier imports automatically. Native widgets, notifications, account sync, and live Google/Apple Calendar synchronization are future platform integrations.

Source: user-supplied school calendar screenshots and 6B class timetable. Verify transcribed exceptions with the school before using them for critical deadlines.
