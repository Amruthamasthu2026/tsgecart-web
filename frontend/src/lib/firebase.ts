import { initializeApp, getApps, type FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFunctions, connectFunctionsEmulator, type Functions } from 'firebase/functions';

/**
 * Firebase client SDK bootstrap for the Firebase Authentication demo flow
 * added alongside the existing app during the Firebase migration (see
 * firebase/README.md, docs/firebase-migration-audit.md). This module is
 * entirely separate from `lib/apiClient.ts` / `contexts/AuthContext.tsx` —
 * nothing here is imported by any existing page, and nothing existing
 * imports this file.
 */
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

function getFirebaseApp(): FirebaseApp {
  const existing = getApps();
  if (existing.length > 0) return existing[0];
  return initializeApp(firebaseConfig);
}

export const firebaseApp = getFirebaseApp();
export const firebaseAuth: Auth = getAuth(firebaseApp);
export const firebaseFunctions: Functions = getFunctions(firebaseApp);

if (import.meta.env.VITE_FIREBASE_USE_EMULATOR === 'true') {
  connectAuthEmulator(firebaseAuth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFunctionsEmulator(firebaseFunctions, '127.0.0.1', 5001);
}
