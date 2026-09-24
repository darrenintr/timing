// Rebuilds src/vendor/firebase.js and src/vendor/capacitor.js: the few Firebase and Capacitor functions Timing uses,
// bundled into local ES modules so the app keeps working offline and still needs no build step. Run: npm install && npm run vendor:firebase
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('node_modules/firebase/package.json', 'utf8'));
await build({
  stdin: {
    contents: `export { initializeApp } from 'firebase/app';
export { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut,
  signInWithCredential, initializeAuth, indexedDBLocalPersistence } from 'firebase/auth';
export { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, writeBatch } from 'firebase/firestore';`,
    resolveDir: process.cwd(), loader: 'js'
  },
  bundle: true, format: 'esm', minify: true, target: 'es2020', platform: 'browser', legalComments: 'none',
  banner: { js: `// Firebase JS SDK ${version} (Apache License 2.0), bundled by scripts/vendor-firebase.mjs. Do not edit.` },
  outfile: 'src/vendor/firebase.js'
});
const core = JSON.parse(readFileSync('node_modules/@capacitor/core/package.json', 'utf8')).version;
await build({
  stdin: { contents: "export { Capacitor, registerPlugin } from '@capacitor/core';", resolveDir: process.cwd(), loader: 'js' },
  bundle: true, format: 'esm', minify: true, target: 'es2020', platform: 'browser', legalComments: 'none',
  banner: { js: `// @capacitor/core ${core} (MIT), bundled by scripts/vendor-firebase.mjs. Do not edit.` },
  outfile: 'src/vendor/capacitor.js'
});
console.log(`Bundled Firebase ${version} and Capacitor ${core} into src/vendor/`);
