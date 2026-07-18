/**
 * TSG eCart — Firebase Cloud Functions entrypoint.
 *
 * Phase 1 exports only the health check. Application functions (auth,
 * catalog, cart, orders, payments, admin) are added in later, separately
 * approved migration phases — see docs/firebase-migration-audit.md.
 */

export { health } from './health/health.function';
