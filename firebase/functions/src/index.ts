/**
 * TSG eCart — Firebase Cloud Functions entrypoint.
 *
 * Phase 1 shipped only the health check. Phase 2 adds the Firebase
 * Authentication functions (default signup claims + admin role management).
 * Catalog/cart/orders/payments/admin functions remain for later, separately
 * approved migration phases — see docs/firebase-migration-audit.md.
 */

export { health } from './health/health.function';
export { onUserCreated } from './auth/onUserCreated.function';
export { setUserRole } from './auth/setUserRole.function';
