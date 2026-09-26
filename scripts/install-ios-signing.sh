#!/usr/bin/env bash
set -euo pipefail

certificate="$RUNNER_TEMP/timing-distribution.p12"
app_profile="$RUNNER_TEMP/timing-app.mobileprovision"
widget_profile="$RUNNER_TEMP/timing-widget.mobileprovision"
printf '%s' "$IOS_CERTIFICATE_P12_BASE64" | base64 -D > "$certificate"
printf '%s' "$IOS_APP_PROFILE_BASE64" | base64 -D > "$app_profile"
printf '%s' "$IOS_WIDGET_PROFILE_BASE64" | base64 -D > "$widget_profile"
security cms -D -i "$app_profile" > "$RUNNER_TEMP/timing-app-profile.plist"
security cms -D -i "$widget_profile" > "$RUNNER_TEMP/timing-widget-profile.plist"

python3 - <<'PY'
import os
import plistlib
from pathlib import Path

root = Path(os.environ['RUNNER_TEMP'])
profiles = [('APP', 'io.github.darrenintr.timing'), ('WIDGET', 'io.github.darrenintr.timing.widget')]
with open(os.environ['GITHUB_ENV'], 'a') as out:
    out.write(f"IOS_TEAM_ID={os.environ['IOS_TEAM_ID']}\n")
    for name, bundle in profiles:
        profile = plistlib.loads((root / f'timing-{name.lower()}-profile.plist').read_bytes())
        entitlement = profile['Entitlements']
        if profile['TeamIdentifier'][0] != os.environ['IOS_TEAM_ID']:
            raise SystemExit(f'{name} profile belongs to a different Apple team')
        if entitlement.get('application-identifier') != f"{os.environ['IOS_TEAM_ID']}.{bundle}":
            raise SystemExit(f'{name} profile has the wrong bundle ID')
        if 'group.io.github.darrenintr.timing' not in entitlement.get('com.apple.security.application-groups', []):
            raise SystemExit(f'{name} profile is missing the Timing App Group')
        if not profile.get('ProvisionedDevices') or entitlement.get('get-task-allow', True):
            raise SystemExit(f'{name} profile must be an ad hoc distribution profile with registered devices')
        value = profile['Name']
        if '\n' in value or '\r' in value:
            raise SystemExit(f'{name} profile name contains a newline')
        out.write(f'IOS_{name}_PROFILE_NAME={value}\n')
        directory = Path.home() / 'Library/MobileDevice/Provisioning Profiles'
        directory.mkdir(parents=True, exist_ok=True)
        (directory / f"{profile['UUID']}.mobileprovision").write_bytes((root / f'timing-{name.lower()}.mobileprovision').read_bytes())
PY

keychain="$RUNNER_TEMP/timing.keychain-db"
keychain_password="$(openssl rand -hex 24)"
security create-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
security import "$certificate" -k "$keychain" -P "$IOS_CERTIFICATE_PASSWORD" -T /usr/bin/codesign
security set-key-partition-list -S apple-tool:,apple: -s -k "$keychain_password" "$keychain"
security list-keychains -d user -s "$keychain"
security find-identity -v -p codesigning "$keychain" | grep -q 'Apple Distribution' || {
  echo '::error::The certificate must contain an Apple Distribution signing identity.'
  exit 1
}
rm -f "$certificate"
