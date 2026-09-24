// Rebuilds src/vendor/firebase.js: the few Firebase functions Timing uses, bundled into one local ES module
// so the app keeps working offline and still needs no build step. Run: npm install && npm run vendor:firebase
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync('node_modules/firebase/package.json', 'utf8'));
await build({
  stdin: {
    contents: `export { initializeApp } from 'firebase/app';
export { getAuth, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from 'firebase/auth';
export { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, collection, doc, onSnapshot, writeBatch } from 'firebase/firestore';`,
    resolveDir: process.cwd(), loader: 'js'
  },
  bundle: true, format: 'esm', minify: true, target: 'es2020', platform: 'browser', legalComments: 'none',
  banner: { js: `// Firebase JS SDK ${version} (Apache License 2.0), bundled by scripts/vendor-firebase.mjs. Do not edit.` },
  outfile: 'src/vendor/firebase.js'
});
console.log(`Bundled Firebase ${version} into src/vendor/firebase.js`);
