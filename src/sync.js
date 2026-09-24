// Google sign-in + Cloud Firestore sync. Loaded only in a browser, after the app has rendered.
//
// Cloud layout (one private area per Google account, enforced by firestore.rules):
//   users/{uid}/homework/{id}      { item, deleted, updatedAt }
//   users/{uid}/overrides/{date}   { value, updatedAt }
//   users/{uid}/meta/settings      { timeMode, updatedAt }
import { firebaseConfig } from './firebase-config.js';
import {
  applyHomeworkDoc, applyOverrideDoc, applySettingsDoc, homeworkDoc, overrideDoc, pendingUploads, settingsDoc
} from './sync-model.js';

const friendlyError = error => ({
  'auth/unauthorized-domain': `${location.hostname} is not an authorised domain in Firebase (Authentication → Settings → Authorized domains).`,
  'auth/network-request-failed': 'No connection. Try signing in again when you are online.',
  'auth/operation-not-allowed': 'Google sign-in is not enabled in Firebase (Authentication → Sign-in method).',
  'permission-denied': 'Firestore refused access. Check that the security rules from firestore.rules are published.'
}[error?.code] ?? error?.message ?? 'Something went wrong.');

export async function startSync({ state, onRemoteChange, onStatus }) {
  // Google blocks its sign-in page inside app web views; native sign-in comes in a later phase.
  if (globalThis.Capacitor?.isNativePlatform?.() || location.protocol === 'timing:') {
    onStatus({ status: 'unavailable' });
    return null;
  }
  const fb = await import('./vendor/firebase.js');
  const app = fb.initializeApp(firebaseConfig);
  const auth = fb.getAuth(app);
  let db;
  try {
    db = fb.initializeFirestore(app, { ignoreUndefinedProperties: true, localCache: fb.persistentLocalCache({ tabManager: fb.persistentMultipleTabManager() }) });
  } catch {
    db = fb.initializeFirestore(app, { ignoreUndefinedProperties: true });
  }

  let user = null;
  let listeners = [];
  let lastSynced = null;
  let error = null;
  const meta = {};

  const report = () => {
    if (!user) return onStatus({ status: 'signed-out', message: error });
    const views = Object.values(meta);
    const status = error ? 'error'
      : views.length < 3 || views.some(view => view.fromCache) || !navigator.onLine ? (views.length < 3 ? 'syncing' : 'offline')
      : views.some(view => view.hasPendingWrites) ? 'syncing' : 'synced';
    if (status === 'synced') lastSynced = Date.now();
    onStatus({ status, email: user.email, name: user.displayName, lastSynced, message: error });
  };
  addEventListener('online', report);
  addEventListener('offline', report);

  const path = (...parts) => fb.doc(db, 'users', user.uid, ...parts);
  async function upload({ homework = [], overrides = [], settings = false }) {
    const writes = [
      ...homework.map(id => [path('homework', id), homeworkDoc(state, id)]),
      ...overrides.map(date => [path('overrides', date), overrideDoc(state, date)]),
      ...(settings ? [[path('meta', 'settings'), settingsDoc(state)]] : [])
    ];
    for (let start = 0; start < writes.length; start += 400) {
      const batch = fb.writeBatch(db);
      for (const [ref, data] of writes.slice(start, start + 400)) batch.set(ref, data);
      // Offline, this promise waits; Firestore keeps the writes and sends them when the connection returns.
      batch.commit().then(() => { error = null; report(); }, failure => { error = friendlyError(failure); report(); });
    }
    report();
  }

  function listen() {
    // After the first answer from the server for all three, upload anything this device has that is newer.
    const remote = { homework: null, overrides: null, settings: undefined };
    let merged = false;
    const firstServerAnswer = (name, stamps, snapshot) => {
      if (merged || snapshot.metadata.fromCache) return;
      remote[name] = stamps;
      if (remote.homework && remote.overrides && remote.settings !== undefined) {
        merged = true;
        upload(pendingUploads(state, { ...remote, settings: remote.settings ?? -1 }));
      }
    };
    const watch = (name, onSnapshot) => (snapshot) => { meta[name] = snapshot.metadata; onSnapshot(snapshot); report(); };
    const failed = failure => { error = friendlyError(failure); report(); };
    const options = { includeMetadataChanges: true };

    listeners = [
      fb.onSnapshot(fb.collection(db, 'users', user.uid, 'homework'), options, watch('homework', snapshot => {
        let changed = false;
        for (const change of snapshot.docChanges()) if (change.type !== 'removed') changed = applyHomeworkDoc(state, change.doc.id, change.doc.data()) || changed;
        if (changed) onRemoteChange();
        firstServerAnswer('homework', Object.fromEntries(snapshot.docs.map(entry => [entry.id, entry.data().updatedAt])), snapshot);
      }), failed),
      fb.onSnapshot(fb.collection(db, 'users', user.uid, 'overrides'), options, watch('overrides', snapshot => {
        let changed = false;
        for (const change of snapshot.docChanges()) if (change.type !== 'removed') changed = applyOverrideDoc(state, change.doc.id, change.doc.data()) || changed;
        if (changed) onRemoteChange();
        firstServerAnswer('overrides', Object.fromEntries(snapshot.docs.map(entry => [entry.id, entry.data().updatedAt])), snapshot);
      }), failed),
      fb.onSnapshot(path('meta', 'settings'), options, watch('settings', snapshot => {
        if (snapshot.exists() && applySettingsDoc(state, snapshot.data())) onRemoteChange();
        firstServerAnswer('settings', snapshot.exists() ? snapshot.data().updatedAt : null, snapshot);
      }), failed)
    ];
  }

  fb.getRedirectResult(auth).catch(failure => { error = friendlyError(failure); report(); });
  fb.onAuthStateChanged(auth, next => {
    listeners.forEach(stop => stop());
    listeners = [];
    for (const name of Object.keys(meta)) delete meta[name];
    user = next;
    error = null;
    if (user) listen();
    report();
  });

  return {
    push(changes) {
      if (!user) return; // Stamped locally; uploaded after the next sign-in.
      upload({ homework: [...changes.homework, ...changes.removed], overrides: changes.overrides, settings: changes.timeMode });
    },
    async signIn() {
      const provider = new fb.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      error = null;
      try {
        await fb.signInWithPopup(auth, provider);
      } catch (failure) {
        if (failure?.code === 'auth/popup-blocked') return fb.signInWithRedirect(auth, provider);
        if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(failure?.code)) return;
        error = friendlyError(failure);
        onStatus({ status: 'signed-out', message: error });
      }
    },
    signOut: () => fb.signOut(auth)
  };
}
