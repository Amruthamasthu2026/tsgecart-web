import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { deleteApp, initializeApp, type FirebaseApp } from 'firebase/app';
import {
  applyActionCode,
  confirmPasswordReset,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  getIdTokenResult,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
} from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { auth as adminAuth } from '../../src/config/firebaseAdmin';

/**
 * Real Auth + Functions emulator integration tests (objectives 12/13).
 *
 * Run via `npm run test:emulator` (wraps this file in `firebase
 * emulators:exec --only auth,firestore,functions`, after a build so the
 * emulator loads the compiled `onUserCreated` / `setUserRole` functions) —
 * requires live Auth + Functions emulators, NOT covered by the plain `npm
 * test` run.
 *
 * Every flow here exercises the real emulator, not mocks: real signup
 * (triggering the real `beforeUserCreated` blocking function), real
 * sign-in, real password-reset / email-verification out-of-band codes
 * fetched from the emulator's REST inspection endpoint, and the real
 * `setUserRole` Callable Function running inside the Functions emulator.
 */

const PROJECT_ID = 'demo-tsgecart';
const AUTH_EMULATOR_HOST = '127.0.0.1';
const AUTH_EMULATOR_PORT = 9099;
const FUNCTIONS_EMULATOR_HOST = '127.0.0.1';
const FUNCTIONS_EMULATOR_PORT = 5001;

let app: FirebaseApp;
let auth: Auth;

function uniqueEmail(label: string): string {
  return `${label}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;
}

interface OobCode {
  email: string;
  requestType: string;
  oobCode: string;
}

async function latestOobCode(email: string, requestType: string): Promise<string> {
  const res = await fetch(
    `http://${AUTH_EMULATOR_HOST}:${AUTH_EMULATOR_PORT}/emulator/v1/projects/${PROJECT_ID}/oobCodes`,
  );
  const body = (await res.json()) as { oobCodes: OobCode[] };
  const matches = body.oobCodes.filter((c) => c.email === email && c.requestType === requestType);
  const match = matches[matches.length - 1];
  if (!match) throw new Error(`No ${requestType} oob code found for ${email}`);
  return match.oobCode;
}

beforeAll(() => {
  app = initializeApp({ projectId: PROJECT_ID, apiKey: 'fake-api-key-for-emulator' });
  auth = getAuth(app);
  connectAuthEmulator(auth, `http://${AUTH_EMULATOR_HOST}:${AUTH_EMULATOR_PORT}`, {
    disableWarnings: true,
  });
  const functions = getFunctions(app);
  connectFunctionsEmulator(functions, FUNCTIONS_EMULATOR_HOST, FUNCTIONS_EMULATOR_PORT);
});

afterAll(async () => {
  await deleteApp(app);
});

describe('signup — default CUSTOMER claim assigned by the onUserCreated blocking function', () => {
  it('a freshly signed-up user has role CUSTOMER with no permissions', async () => {
    const email = uniqueEmail('customer-login');
    const cred = await createUserWithEmailAndPassword(auth, email, 'Password123!');
    const tokenResult = await getIdTokenResult(cred.user, true);
    expect(tokenResult.claims.role).toBe('CUSTOMER');
    expect(tokenResult.claims.permissions).toEqual([]);
  });
});

describe('login / logout', () => {
  it('signs in with the correct password and signs out cleanly', async () => {
    const email = uniqueEmail('login-logout');
    const password = 'Password123!';
    await createUserWithEmailAndPassword(auth, email, password);
    await signOut(auth);

    const cred = await signInWithEmailAndPassword(auth, email, password);
    expect(cred.user.email).toBe(email);
    expect(auth.currentUser?.uid).toBe(cred.user.uid);

    await signOut(auth);
    expect(auth.currentUser).toBeNull();
  });

  it('rejects sign-in with the wrong password', async () => {
    const email = uniqueEmail('wrong-password');
    await createUserWithEmailAndPassword(auth, email, 'Password123!');
    await signOut(auth);
    await expect(signInWithEmailAndPassword(auth, email, 'NotThePassword!')).rejects.toThrow();
  });
});

describe('forgot password / password reset — full round trip via emulator OOB codes', () => {
  it('resets the password and the new password (not the old one) signs in afterwards', async () => {
    const email = uniqueEmail('password-reset');
    const oldPassword = 'OldPassword123!';
    const newPassword = 'NewPassword456!';
    await createUserWithEmailAndPassword(auth, email, oldPassword);
    await signOut(auth);

    await sendPasswordResetEmail(auth, email);
    const oobCode = await latestOobCode(email, 'PASSWORD_RESET');
    await confirmPasswordReset(auth, oobCode, newPassword);

    await expect(signInWithEmailAndPassword(auth, email, oldPassword)).rejects.toThrow();
    const cred = await signInWithEmailAndPassword(auth, email, newPassword);
    expect(cred.user.email).toBe(email);
  });
});

describe('email verification — full round trip via emulator OOB codes', () => {
  it('emailVerified flips from false to true after applying the verification code', async () => {
    const email = uniqueEmail('email-verify');
    const cred = await createUserWithEmailAndPassword(auth, email, 'Password123!');
    expect(cred.user.emailVerified).toBe(false);

    await sendEmailVerification(cred.user);
    const oobCode = await latestOobCode(email, 'VERIFY_EMAIL');
    await applyActionCode(auth, oobCode);

    await reload(cred.user);
    expect(cred.user.emailVerified).toBe(true);
  });
});

describe('admin role management — setUserRole Callable Function', () => {
  it('an ADMIN caller can promote a customer to DELIVERY_PARTNER, and it takes effect on next sign-in', async () => {
    // Bootstrap: an ADMIN's claims can only ever come from the Admin SDK
    // (either this one-time bootstrap or a call from an existing ADMIN) —
    // never from signup input. This mirrors scripts/setInitialAdmin.ts.
    const adminEmail = uniqueEmail('bootstrap-admin');
    const adminRecord = await adminAuth.createUser({ email: adminEmail, password: 'AdminPass123!' });
    await adminAuth.setCustomUserClaims(adminRecord.uid, { role: 'ADMIN', permissions: [] });

    const adminCred = await signInWithEmailAndPassword(auth, adminEmail, 'AdminPass123!');
    const adminTokenResult = await getIdTokenResult(adminCred.user, true);
    expect(adminTokenResult.claims.role).toBe('ADMIN');

    // Target: an ordinary signed-up customer.
    const targetEmail = uniqueEmail('target-delivery-partner');
    const targetPassword = 'TargetPass123!';
    const targetCred = await createUserWithEmailAndPassword(auth, targetEmail, targetPassword);
    const targetUid = targetCred.user.uid;
    const targetBeforeToken = await getIdTokenResult(targetCred.user, true);
    expect(targetBeforeToken.claims.role).toBe('CUSTOMER');

    // Call setUserRole as the signed-in admin (auth.currentUser drives the
    // callable's ID token — sign back into the admin account first).
    await signInWithEmailAndPassword(auth, adminEmail, 'AdminPass123!');
    const functions = getFunctions(app);
    const setUserRole = httpsCallable<
      { uid: string; role: string; permissions: string[] },
      { uid: string; role: string; permissions: string[] }
    >(functions, 'setUserRole');
    const result = await setUserRole({ uid: targetUid, role: 'DELIVERY_PARTNER', permissions: [] });
    expect(result.data).toEqual({ uid: targetUid, role: 'DELIVERY_PARTNER', permissions: [] });

    // The callable revokes the target's refresh tokens, so the old session
    // must re-authenticate to observe the new claim (delivery-login check).
    const refreshedTargetCred = await signInWithEmailAndPassword(auth, targetEmail, targetPassword);
    const targetAfterToken = await getIdTokenResult(refreshedTargetCred.user, true);
    expect(targetAfterToken.claims.role).toBe('DELIVERY_PARTNER');
  });

  it('a non-ADMIN caller is rejected with permission-denied', async () => {
    const email = uniqueEmail('not-an-admin');
    await createUserWithEmailAndPassword(auth, email, 'Password123!');

    const functions = getFunctions(app);
    const setUserRole = httpsCallable(functions, 'setUserRole');
    await expect(setUserRole({ uid: 'whoever', role: 'ADMIN', permissions: [] })).rejects.toMatchObject({
      code: 'functions/permission-denied',
    });
  });
});
