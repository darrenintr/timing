"""Configure generated Capacitor projects for Google login, when Firebase files exist."""
import base64
import os
import plistlib
import sys
from pathlib import Path

platform = sys.argv[1]
if platform == 'android':
    variables = Path('android/variables.gradle')
    variables.write_text(variables.read_text().rstrip() + "\n\next.rgcfaIncludeGoogle = true\next.androidxCredentialsVersion = '1.3.0'\n")
    encoded = os.environ.get('TIMING_FIREBASE_ANDROID_JSON_BASE64')
    if encoded:
        Path('android/app/google-services.json').write_bytes(base64.b64decode(encoded, validate=True))
    elif os.environ.get('TIMING_FIREBASE_CONFIG'):
        sys.exit('Firebase web config provided but TIMING_FIREBASE_ANDROID_JSON_BASE64 is missing')
    print('Android Google sign-in dependency enabled; native project file ' + ('installed' if encoded else 'awaiting setup'))

elif platform == 'ios':
    podfile = Path('ios/App/Podfile')
    content = podfile.read_text().replace('  # Add your Pods here',
      "  pod 'CapacitorFirebaseAuthentication/Google', :path => '../../node_modules/@capacitor-firebase/authentication'\n  # Add your Pods here")
    content = content.replace('  assertDeploymentTarget(installer)',
      "  assertDeploymentTarget(installer)\n  installer.pods_project.targets.each do |target|\n    if target.respond_to?(:product_type) && target.product_type == 'com.apple.product-type.bundle'\n      target.build_configurations.each { |config| config.build_settings['CODE_SIGNING_ALLOWED'] = 'NO' }\n    end\n  end")
    podfile.write_text(content)
    encoded = os.environ.get('TIMING_FIREBASE_IOS_PLIST_BASE64')
    if not encoded:
        if os.environ.get('TIMING_FIREBASE_CONFIG'):
            sys.exit('Firebase web config provided but TIMING_FIREBASE_IOS_PLIST_BASE64 is missing')
        print('iOS Google sign-in dependency enabled; native project file awaiting setup')
        sys.exit(0)
    raw = base64.b64decode(encoded, validate=True)
    settings = plistlib.loads(raw)
    reversed_id = settings.get('REVERSED_CLIENT_ID')
    if not reversed_id:
        sys.exit('iOS Firebase plist is missing REVERSED_CLIENT_ID')
    Path('ios/App/App/GoogleService-Info.plist').write_bytes(raw)
    info = Path('ios/App/App/Info.plist')
    info_data = plistlib.loads(info.read_bytes())
    info_data.setdefault('CFBundleURLTypes', []).append({'CFBundleURLSchemes': [reversed_id]})
    info.write_bytes(plistlib.dumps(info_data))
    project = Path('ios/App/App.xcodeproj/project.pbxproj')
    content = project.read_text()
    build_id, file_id = 'A1B2C3D4E5F60718293A4B5C', 'A1B2C3D4E5F60718293A4B5D'
    content = content.replace('/* End PBXBuildFile section */',
      f'\t\t{build_id} /* GoogleService-Info.plist in Resources */ = {{isa = PBXBuildFile; fileRef = {file_id} /* GoogleService-Info.plist */; }};\n/* End PBXBuildFile section */')
    content = content.replace('/* End PBXFileReference section */',
      f'\t\t{file_id} /* GoogleService-Info.plist */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = "GoogleService-Info.plist"; sourceTree = "<group>"; }};\n/* End PBXFileReference section */')
    content = content.replace('/* AppDelegate.swift */,\n', f'/* AppDelegate.swift */,\n\t\t\t\t{file_id} /* GoogleService-Info.plist */,\n', 1)
    content = content.replace('/* config.xml in Resources */,\n', f'/* config.xml in Resources */,\n\t\t\t\t{build_id} /* GoogleService-Info.plist in Resources */,\n', 1)
    project.write_text(content)
    print('iOS Google sign-in plist, URL scheme and build resource installed')
else:
    sys.exit(f'Unknown platform: {platform}')
