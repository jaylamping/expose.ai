import { initializeApp, getApps, type FirebaseApp } from "firebase/app";
import { getFirestore, type Firestore } from "firebase/firestore";
import { FIREBASE_CONFIG } from "./constants";

let app: FirebaseApp | null = null;
let db: Firestore | null = null;

export async function initializeFirebase(): Promise<Firestore> {
  if (!app) {
    if (!FIREBASE_CONFIG.projectId) {
      throw new Error(
        "Missing Firebase configuration. Ensure VITE_FIREBASE_* env vars are set."
      );
    }
    app = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
  }
  if (!db) {
    db = getFirestore(app);
  }
  return db;
}
