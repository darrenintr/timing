import { Capacitor } from '@capacitor/core';
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { emptySnapshot, mergeSnapshots } from './sync-data.js';

// Web Firebase configuration is public, but must come from the app owner's project.
const config = typeof __TIMING_FIREBASE_CONFIG__ === 'undefined' ? {} : __TIMING_FIREBASE_CONFIG__;
export const cloudConfigured = Boolean(config.apiKey && config.authDomain && config.projectId && config.appId);
if (cloudConfigured) initializeApp(config);

export const currentAccount = async () => {
  if (!cloudConfigured) return null;
  if (!Capacitor.isNativePlatform()) await getAuth().authStateReady();
  return (await FirebaseAuthentication.getCurrentUser()).user;
};
export const googleSignIn = async () => {
  if (!cloudConfigured) throw new Error('Google sync is awaiting this app’s Firebase project configuration.');
  return (await FirebaseAuthentication.signInWithGoogle()).user;
};
export const googleSignOut = async () => FirebaseAuthentication.signOut();
export const nativeApp = Capacitor.isNativePlatform();

const endpoint = uid => `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents/timingUsers/${encodeURIComponent(uid)}/data/s6`;
async function request(uid, method, payload, updateTime) {
  const {token} = await FirebaseAuthentication.getIdToken();
  if (!token) throw new Error('Google session expired. Sign in again to sync.');
  const url = new URL(endpoint(uid));
  if (method === 'PATCH') {
    if (updateTime) url.searchParams.set('currentDocument.updateTime', updateTime);
    else url.searchParams.set('currentDocument.exists', 'false');
  }
  const response = await fetch(url, {
    method, headers:{Authorization:`Bearer ${token}`, ...(payload ? {'Content-Type':'application/json'} : {})},
    ...(payload ? {body:JSON.stringify({fields:{payload:{stringValue:JSON.stringify(payload)}}})} : {})
  });
  if (response.status === 404 && method === 'GET') return null;
  if (!response.ok) {
    if (response.status === 403) throw new Error('Cloud sync is blocked. Check this app’s Firestore rules and project setup.');
    if (response.status === 401) throw new Error('Google session expired. Sign in again to sync.');
    const error = new Error(`Cloud sync failed (${response.status}).`);
    error.conflict = response.status === 409 || response.status === 412;
    throw error;
  }
  return response.json();
}
export async function syncAccount(uid, local, transport = request) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const remoteDoc = await transport(uid, 'GET');
    let remote;
    try { remote = remoteDoc ? JSON.parse(remoteDoc.fields.payload.stringValue) : emptySnapshot(); }
    catch { throw new Error('The cloud document could not be read. Local work was kept.'); }
    const merged = mergeSnapshots(local, remote);
    if (remoteDoc && JSON.stringify(merged) === JSON.stringify(remote)) return merged;
    try {
      await transport(uid, 'PATCH', merged, remoteDoc?.updateTime);
      return merged;
    } catch (error) { if (!error.conflict || attempt === 3) throw error; }
  }
}
