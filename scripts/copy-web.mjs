import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { build } from 'esbuild';

const firebase = JSON.parse(process.env.TIMING_FIREBASE_CONFIG || '{}');
if (Object.keys(firebase).length && !['apiKey', 'authDomain', 'projectId', 'appId'].every(key => firebase[key])) {
  throw new Error('TIMING_FIREBASE_CONFIG must include apiKey, authDomain, projectId, and appId.');
}

rmSync('www', { recursive: true, force: true });
mkdirSync('www/src', { recursive: true });
for (const name of ['index.html', 'icon.svg', 'manifest.webmanifest', 'sw.js']) cpSync(name, `www/${name}`);
cpSync('src/style.css', 'www/src/style.css');
await build({entryPoints:['src/main.js'], outfile:'www/src/main.js', bundle:true, platform:'browser', format:'esm', minify:true,
  define:{__TIMING_FIREBASE_CONFIG__:JSON.stringify(firebase)}});
console.log(`Built web assets in www/ (${firebase.projectId ? 'Google sync configured' : 'local only until Firebase is configured'})`);
