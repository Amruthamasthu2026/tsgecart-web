/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL: string;
  readonly VITE_RAZORPAY_KEY_ID: string;
  // Firebase Authentication demo flow (Firebase migration, added alongside
  // the existing JWT-based auth — see frontend/src/lib/firebase.ts). Not
  // used by any existing page.
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_USE_EMULATOR?: string;
  // Feature flag (Firebase migration Phase 3): when "true", Home/Products/
  // Product-detail read from Firestore (services/firebaseProducts.ts)
  // instead of the existing Express catalog API. Unset/false (the default)
  // keeps every page on the existing Express API, unchanged.
  readonly VITE_USE_FIRESTORE_PRODUCTS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
