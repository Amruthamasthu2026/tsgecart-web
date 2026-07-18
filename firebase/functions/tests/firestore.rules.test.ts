import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';

/**
 * Firestore Security Rules tests for the Phase 1 default-deny foundation.
 *
 * Run via `npm run test:rules` (wraps this file in
 * `firebase emulators:exec --only firestore`) — requires the Firestore
 * emulator, NOT covered by the plain `npm test` unit-test run. See
 * firebase/functions/package.json and firebase/README.md.
 *
 * Every production collection this project will eventually use is still
 * commented out in firestore.rules (Phase 1 scope). `mainEnv` below loads
 * the real, committed firestore.rules file and exercises exactly what is
 * live right now: the default-deny catch-all. `helperEnv` loads a small,
 * self-contained rules document (inline here, not the committed file) whose
 * only purpose is to exercise the isAdmin()/isOwner()-style helper-function
 * logic end-to-end against real custom claims — the same helper functions
 * that are already written into firestore.rules and will be reused as each
 * production collection's rules are uncommented in a later phase.
 */

const MAIN_PROJECT_ID = 'demo-tsgecart-rules-main';
const HELPER_PROJECT_ID = 'demo-tsgecart-rules-helper';

let mainEnv: RulesTestEnvironment;
let helperEnv: RulesTestEnvironment;

const HELPER_RULES = `
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      function isSignedIn() { return request.auth != null; }
      function callerRole() { return isSignedIn() ? request.auth.token.get('role', null) : null; }
      function isAdmin() { return isSignedIn() && callerRole() == 'ADMIN'; }
      function isOwner(userId) { return isSignedIn() && request.auth.uid == userId; }
      function isDeliveryPartner() { return isSignedIn() && callerRole() == 'DELIVERY_PARTNER'; }

      match /_rulesTestScratch/{docId} {
        allow read: if isAdmin() || isOwner(resource.data.userId);
        allow write: if isAdmin();
      }
      match /_rulesTestDeliveryScratch/{docId} {
        allow read: if isAdmin() || isDeliveryPartner();
        allow write: if isAdmin();
      }
      match /{document=**} {
        allow read, write: if false;
      }
    }
  }
`;

beforeAll(async () => {
  const realRules = readFileSync(join(__dirname, '..', '..', 'firestore.rules'), 'utf8');
  [mainEnv, helperEnv] = await Promise.all([
    initializeTestEnvironment({
      projectId: MAIN_PROJECT_ID,
      firestore: { rules: realRules, host: 'localhost', port: 8080 },
    }),
    initializeTestEnvironment({
      projectId: HELPER_PROJECT_ID,
      firestore: { rules: HELPER_RULES, host: 'localhost', port: 8080 },
    }),
  ]);
});

afterAll(async () => {
  await Promise.all([mainEnv?.cleanup(), helperEnv?.cleanup()]);
});

beforeEach(async () => {
  await Promise.all([mainEnv.clearFirestore(), helperEnv.clearFirestore()]);
});

describe('firestore.rules — default-deny foundation (real committed rules file)', () => {
  it('denies an anonymous read of any unknown collection', async () => {
    const anon = mainEnv.unauthenticatedContext();
    await assertFails(anon.firestore().doc('someUnknownCollection/doc1').get());
  });

  it('denies an anonymous write to any unknown collection', async () => {
    const anon = mainEnv.unauthenticatedContext();
    await assertFails(anon.firestore().doc('someUnknownCollection/doc1').set({ hello: 'world' }));
  });

  it('denies an authenticated (no-claims) user reading an unknown collection', async () => {
    const user = mainEnv.authenticatedContext('user-1');
    await assertFails(user.firestore().doc('anotherUnknownCollection/doc1').get());
  });

  it('denies an authenticated (no-claims) user writing an unknown collection', async () => {
    const user = mainEnv.authenticatedContext('user-1');
    await assertFails(user.firestore().doc('anotherUnknownCollection/doc1').set({ quantity: 1 }));
  });

  it('denies access even to a user with a real ADMIN claim, for collections not yet opened', async () => {
    // Having a genuine ADMIN custom claim does not bypass the default-deny
    // catch-all for paths with no explicit `match` block yet — every
    // collection must be deliberately opened, never implicitly available.
    const admin = mainEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    await assertFails(admin.firestore().doc('someFutureCollection/doc1').get());
  });

  it('a document field claiming admin-ness grants no access (fake admin fields do not work)', async () => {
    await mainEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await adminCtx
        .firestore()
        .doc('someUnknownCollection/fakeAdminDoc')
        .set({ role: 'ADMIN', isAdmin: true, admin: true, userId: 'nobody' });
    });

    const user = mainEnv.authenticatedContext('user-2');
    await assertFails(user.firestore().doc('someUnknownCollection/fakeAdminDoc').get());

    const anon = mainEnv.unauthenticatedContext();
    await assertFails(anon.firestore().doc('someUnknownCollection/fakeAdminDoc').get());
  });

  it('an arbitrary custom-claims shape (not the real role/permissions claims) confers no access', async () => {
    // A caller whose token has an `isAdmin: true`-style claim instead of
    // the real `role: 'ADMIN'` shape the rules helpers check for must not
    // gain access beyond what default-deny already denies to everyone.
    const impostor = mainEnv.authenticatedContext('impostor-1', { isAdmin: true, admin: true });
    await assertFails(impostor.firestore().doc('someUnknownCollection/doc1').get());
  });
});

describe('firestore.rules helper functions (isAdmin/isOwner) against real custom claims', () => {
  beforeEach(async () => {
    await helperEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await adminCtx.firestore().doc('_rulesTestScratch/doc1').set({ userId: 'owner-1' });
    });
  });

  it('grants read to the real ADMIN-claim holder', async () => {
    const admin = helperEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    await assertSucceeds(admin.firestore().doc('_rulesTestScratch/doc1').get());
  });

  it('grants read to the document owner (matched by uid, not by a document field claiming a role)', async () => {
    const owner = helperEnv.authenticatedContext('owner-1');
    await assertSucceeds(owner.firestore().doc('_rulesTestScratch/doc1').get());
  });

  it('denies read to a non-owner, non-admin authenticated user', async () => {
    const stranger = helperEnv.authenticatedContext('stranger-1');
    await assertFails(stranger.firestore().doc('_rulesTestScratch/doc1').get());
  });

  it('denies write to a non-admin, even the document owner', async () => {
    const owner = helperEnv.authenticatedContext('owner-1');
    await assertFails(
      owner.firestore().doc('_rulesTestScratch/doc1').set({ userId: 'owner-1', hacked: true }),
    );
  });

  it('a fake `role` field on the document itself does not substitute for the ADMIN claim', async () => {
    await helperEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await adminCtx
        .firestore()
        .doc('_rulesTestScratch/doc2')
        .set({ userId: 'someone-else', role: 'ADMIN' });
    });
    // stranger-2 has no ADMIN custom claim on their own token — the target
    // document merely *contains* a field named "role" set to "ADMIN".
    const stranger = helperEnv.authenticatedContext('stranger-2');
    await assertFails(stranger.firestore().doc('_rulesTestScratch/doc2').get());
  });

  it('confirms custom claims are the sole authority: identical doc, only the token differs', async () => {
    await helperEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await adminCtx.firestore().doc('_rulesTestScratch/doc3').set({ userId: 'owner-3' });
    });
    const withoutClaim = helperEnv.authenticatedContext('owner-3'); // no role claim at all
    const withRealClaim = helperEnv.authenticatedContext('admin-3', { role: 'ADMIN' });

    // Owner (matched by uid) succeeds via isOwner(), independent of any claim.
    await assertSucceeds(withoutClaim.firestore().doc('_rulesTestScratch/doc3').get());
    // A different uid succeeds only because it carries the real ADMIN claim.
    await assertSucceeds(withRealClaim.firestore().doc('_rulesTestScratch/doc3').get());
  });
});

describe('firestore.rules helper function (isDeliveryPartner) against real custom claims', () => {
  beforeEach(async () => {
    await helperEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await adminCtx.firestore().doc('_rulesTestDeliveryScratch/doc1').set({ note: 'route-42' });
    });
  });

  it('grants read to a caller with the real DELIVERY_PARTNER claim', () => {
    const partner = helperEnv.authenticatedContext('partner-1', { role: 'DELIVERY_PARTNER' });
    return assertSucceeds(partner.firestore().doc('_rulesTestDeliveryScratch/doc1').get());
  });

  it('denies read to a signed-in CUSTOMER (no DELIVERY_PARTNER claim)', () => {
    const customer = helperEnv.authenticatedContext('customer-1', { role: 'CUSTOMER' });
    return assertFails(customer.firestore().doc('_rulesTestDeliveryScratch/doc1').get());
  });

  it('denies read to an authenticated user with no role claim at all', () => {
    const stranger = helperEnv.authenticatedContext('stranger-1');
    return assertFails(stranger.firestore().doc('_rulesTestDeliveryScratch/doc1').get());
  });

  it('denies write even to a genuine DELIVERY_PARTNER (admin-only write in this scratch collection)', () => {
    const partner = helperEnv.authenticatedContext('partner-1', { role: 'DELIVERY_PARTNER' });
    return assertFails(
      partner.firestore().doc('_rulesTestDeliveryScratch/doc1').set({ note: 'hacked' }),
    );
  });
});

describe('sanity: rules test setup itself is exercising real emulator round-trips', () => {
  it('withSecurityRulesDisabled writes are actually persisted and readable back by an admin context', async () => {
    await helperEnv.withSecurityRulesDisabled(async (adminCtx) => {
      await adminCtx.firestore().doc('_rulesTestScratch/roundtrip').set({ userId: 'owner-1', n: 42 });
    });
    const admin = helperEnv.authenticatedContext('admin-1', { role: 'ADMIN' });
    const snap = await assertSucceeds(admin.firestore().doc('_rulesTestScratch/roundtrip').get());
    expect(snap.data()).toEqual({ userId: 'owner-1', n: 42 });
  });
});
