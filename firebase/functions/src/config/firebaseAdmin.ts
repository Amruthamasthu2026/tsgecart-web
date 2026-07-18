import { initializeApp, getApps, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import { getAuth, type Auth } from 'firebase-admin/auth';

/**
 * Single Admin SDK app instance, initialized lazily and only once per
 * function-container lifecycle (Cloud Functions may reuse a warm instance
 * across invocations — re-initializing on every call would be wasteful and,
 * for some SDK internals, incorrect).
 *
 * No credentials are passed explicitly: in both the deployed environment and
 * the Local Emulator Suite, `initializeApp()` with no arguments picks up
 * Application Default Credentials / emulator hosts automatically from the
 * environment Firebase sets for you. Never construct a `credential.cert()`
 * from an inline service-account object here — that pattern is exactly the
 * "expose Firebase Admin credentials" risk the migration's safety rules
 * prohibit.
 */
function getAdminApp(): App {
  const existing = getApps();
  if (existing.length > 0) return existing[0];
  return initializeApp();
}

export const adminApp = getAdminApp();
export const db: Firestore = getFirestore(adminApp);
export const auth: Auth = getAuth(adminApp);
