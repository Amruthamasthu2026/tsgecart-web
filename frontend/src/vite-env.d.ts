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
  // Feature flags (Firebase migration Phase 4): when "true", the cart /
  // wishlist / address-management UI reads and writes Firestore
  // (services/firebaseCart.ts, firebaseWishlist.ts, firebaseAddresses.ts)
  // instead of the existing Express APIs. Each flag is independent. Unset/
  // false (the default) keeps that feature on the existing Express API,
  // unchanged. Using any of these requires being signed in via Firebase
  // (see contexts/FirebaseAuthContext.tsx) — the existing JWT session does
  // not carry a Firebase ID token, so Firestore Security Rules cannot
  // recognize it.
  readonly VITE_USE_FIRESTORE_CART?: string;
  readonly VITE_USE_FIRESTORE_WISHLIST?: string;
  readonly VITE_USE_FIRESTORE_ADDRESSES?: string;
  // Feature flags (Firebase migration Phase 5): when "true", checkout /
  // orders / coupon-validation / the reward-spin wheel read and write
  // Firestore (services/firebaseOrders.ts, firebaseCoupons.ts,
  // firebaseRewards.ts) instead of the existing Express APIs. Each flag is
  // independent. Unset/false (the default) keeps that feature on the
  // existing Express API, unchanged.
  readonly VITE_USE_FIRESTORE_CHECKOUT?: string;
  readonly VITE_USE_FIRESTORE_ORDERS?: string;
  readonly VITE_USE_FIRESTORE_COUPONS?: string;
  readonly VITE_USE_FIRESTORE_REWARDS?: string;
  readonly VITE_USE_FIREBASE_RAZORPAY?: string;
  readonly VITE_USE_FIRESTORE_NOTIFICATIONS?: string;
  // Feature flag (Firebase migration Phase 6): when "true", the entire
  // admin console (Dashboard/Orders/Products/Categories/Coupons/Rewards/
  // Customers/Delivery) reads and writes Firestore
  // (services/firebaseAdmin.ts) instead of the existing Express admin API,
  // and the /admin route guard switches to Firebase Auth. Unset/false (the
  // default) keeps the entire admin console on the existing Express API,
  // unchanged.
  readonly VITE_USE_FIRESTORE_ADMIN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
