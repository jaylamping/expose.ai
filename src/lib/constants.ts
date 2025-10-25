export const HOST_ALLOWLIST = [
  "reddit.com",
  "x.com",
  //   "instagram.com", someday maybe
];

export const APP_NAME = "expose.ai";
export const REDDIT_API_BASE = "https://oauth.reddit.com";

// Firebase config env keys expected via Vite env
export const FIREBASE_CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};
