#!/bin/sh
set -eu

cd "$CI_PRIMARY_REPOSITORY_PATH"

npm ci --no-audit --no-fund
npm run package:web
python3 scripts/configure-native.py prepare-ios
npx cap sync ios
python3 scripts/configure-native.py ios

cd ios/App
rm -f Podfile.lock
pod install
