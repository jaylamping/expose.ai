import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getFirestore, type Firestore } from 'firebase/firestore/lite';
import { FIREBASE_CONFIG } from './constants';

const FIREBASE_DB_ID = import.meta.env.VITE_FIREBASE_DB_ID as
  | string
  | undefined;

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

export async function initializeFirebase(): Promise<Firestore> {
  if (!app) {
    if (!FIREBASE_CONFIG.projectId) {
      throw new Error(
        'Missing Firebase configuration. Ensure VITE_FIREBASE_* env vars are set.'
      );
    }
    app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  }
  if (!db) {
    // Using Firestore Lite for MV3 service worker stability
    db = FIREBASE_DB_ID ? getFirestore(app, FIREBASE_DB_ID) : getFirestore(app);
  }
  return db;
}
