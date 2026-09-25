import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {cpSync, mkdtempSync, readFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const script = new URL('../scripts/configure-native.py', import.meta.url).pathname;
const settings = new URL('../capacitor.config.json', import.meta.url).pathname;

test('unconfigured native package excludes Firebase; configured one includes it', () => {
  const dir = mkdtempSync(join(tmpdir(), 'timing-native-'));
  try {
    cpSync(settings, join(dir, 'capacitor.config.json'));
    const run = (name, vars = {}) => execFileSync('python3', [script, name], {cwd:dir, env:{...process.env, TIMING_FIREBASE_CONFIG:'', TIMING_FIREBASE_IOS_PLIST_BASE64:'', TIMING_FIREBASE_ANDROID_JSON_BASE64:'', ...vars}});
    run('prepare-ios'); run('prepare-android');
    let config = JSON.parse(readFileSync(join(dir, 'capacitor.config.json')));
    assert.deepEqual(config.ios.includePlugins, []);
    assert.deepEqual(config.android.includePlugins, []);
    run('prepare-ios', {TIMING_FIREBASE_CONFIG:'{"projectId":"example"}', TIMING_FIREBASE_IOS_PLIST_BASE64:'Zml4dHVyZQ=='});
    config = JSON.parse(readFileSync(join(dir, 'capacitor.config.json')));
    assert.deepEqual(config.ios.includePlugins, ['@capacitor-firebase/authentication']);
    assert.deepEqual(config.android.includePlugins, []);
  } finally { rmSync(dir, {recursive:true, force:true}); }
});
