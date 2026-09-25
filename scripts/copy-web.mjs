import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { build } from 'esbuild';
import { firebaseConfig } from '../src/firebase-config.js';

// TIMING_FIREBASE_CONFIG overrides the project's committed public Web config; '{}' builds a local-only app.
const firebase = process.env.TIMING_FIREBASE_CONFIG ? JSON.parse(process.env.TIMING_FIREBASE_CONFIG) : firebaseConfig;
if (Object.keys(firebase).length && !['apiKey', 'authDomain', 'projectId', 'appId'].every(key => firebase[key])) {
  throw new Error('TIMING_FIREBASE_CONFIG must include apiKey, authDomain, projectId, and appId.');
}

rmSync('www', { recursive: true, force: true });
mkdirSync('www/src/fonts', { recursive: true });
for (const name of ['index.html', 'icon.svg', 'icon-maskable.svg', 'icon-monochrome.svg', 'manifest.webmanifest', 'sw.js']) cpSync(name, `www/${name}`);
cpSync('src/style.css', 'www/src/style.css');
for (const name of ['roboto-flex.woff2', 'fraunces.woff2', 'fraunces-italic.woff2', 'jetbrains-mono.woff2']) cpSync(`src/fonts/${name}`, `www/src/fonts/${name}`);
await build({entryPoints:['src/main.js'], outfile:'www/src/main.js', bundle:true, platform:'browser', format:'esm', minify:true,
  define:{__TIMING_FIREBASE_CONFIG__:JSON.stringify(firebase)}});
console.log(`Built web assets in www/ (${firebase.projectId ? 'Google sync configured' : 'local only until Firebase is configured'})`);
