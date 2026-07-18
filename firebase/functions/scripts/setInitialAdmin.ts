/**
 * NOT EXECUTED automatically. One-time manual bootstrap: grants the ADMIN
 * role to a single existing Firebase Auth user, identified by email.
 *
 * This exists to solve the chicken-and-egg problem `setUserRole` has by
 * design (it requires an already-ADMIN caller — see
 * src/auth/setUserRole.function.ts): there is no other path to the very
 * first ADMIN account, and per docs/firebase-migration-audit.md there must
 * not be one — no email allowlist, no hardcoded admin address baked into
 * any Function. A human operator runs this once, manually, against a
 * user who already exists (signed up normally, so they already hold the
 * default CUSTOMER claim).
 *
 * Usage (run manually by a human operator with Admin SDK credentials —
 * never wired into any npm lifecycle script, build step, or CI job):
 *   npx tsx scripts/setInitialAdmin.ts <email>
 */
import { auth as adminAuth } from '../src/config/firebaseAdmin';
import { applyUserRole } from '../src/auth/setUserRole.function';

async function main(): Promise<void> {
  const email = process.argv[2];
  if (!email) {
    throw new Error('Usage: setInitialAdmin.ts <email>');
  }

  const user = await adminAuth.getUserByEmail(email);
  const result = await applyUserRole(
    { uid: user.uid, role: 'ADMIN', permissions: [] },
    {
      getUser: (uid) => adminAuth.getUser(uid),
      setCustomUserClaims: (uid, claims) => adminAuth.setCustomUserClaims(uid, claims),
      revokeRefreshTokens: (uid) => adminAuth.revokeRefreshTokens(uid),
    },
  );

  console.log(
    `Granted ADMIN to ${email} (uid: ${result.uid}). Their existing sessions were revoked — they must sign in again to receive the new claim.`,
  );
}

if (require.main === module) {
  main().catch((err: unknown) => {
    console.error('setInitialAdmin failed:', err);
    process.exitCode = 1;
  });
}
