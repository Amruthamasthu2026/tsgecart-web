import { beforeUserCreated } from 'firebase-functions/v2/identity';
import type { AuthBlockingEvent } from 'firebase-functions/v2/identity';
import { logger } from '../shared/logger';
import type { Role } from '../shared/auth';

/**
 * Every account created through Firebase Authentication starts as a plain
 * CUSTOMER with no extra permissions. ADMIN/STAFF/DELIVERY_PARTNER are only
 * ever granted afterwards, explicitly, via the `setUserRole` Callable
 * Function (see setUserRole.function.ts) — never inferred from signup input,
 * an email address, or any other client-controlled value.
 */
const DEFAULT_ROLE: Role = 'CUSTOMER';

export interface DefaultClaims {
  role: Role;
  permissions: string[];
}

/** Pure — no Firebase call, so it is unit-testable without the emulator. */
export function buildDefaultClaims(): DefaultClaims {
  return { role: DEFAULT_ROLE, permissions: [] };
}

/**
 * `beforeUserCreated` (a Blocking Function) runs synchronously during
 * account creation, before the very first ID token is minted. This is
 * deliberately used instead of a non-blocking `onCreate` trigger: a
 * non-blocking trigger can lose the race against the client's own
 * post-signup `getIdToken()` call, leaving the first token briefly
 * claims-less. Blocking guarantees every issued token — including the
 * first one — already carries `role: 'CUSTOMER'`.
 */
export const onUserCreated = beforeUserCreated((event: AuthBlockingEvent) => {
  const claims = buildDefaultClaims();
  logger.info('Assigning default signup claims', { uid: event.data?.uid, role: claims.role });
  return { customClaims: claims };
});
