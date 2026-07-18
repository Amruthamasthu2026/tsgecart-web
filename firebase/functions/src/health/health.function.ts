import { onRequest } from 'firebase-functions/v2/https';
import { logger } from '../shared/logger';
import { corsOrigins, isEmulator } from '../config/environment';

const SERVICE_NAME = 'tsgecart-firebase';

export interface HealthResponseBody {
  success: true;
  service: string;
  timestamp: string;
}

/**
 * Minimal request/response shapes `handleHealthRequest` depends on. Kept
 * intentionally decoupled from Express's/Firebase's own `Request`/`Response`
 * types (rather than `Pick<Response, ...>`) so a plain mock object can
 * satisfy them structurally in tests without implementing the other ~90
 * Express Response methods TypeScript would otherwise demand.
 */
export interface MinimalRequest {
  method: string;
}
export interface MinimalResponse {
  status(code: number): MinimalResponse;
  json(body: unknown): MinimalResponse;
}

/**
 * Pure handler logic, kept separate from the `onRequest` wrapper below so it
 * can be unit-tested with plain mock req/res objects — no emulator required
 * — mirroring the "pure function + thin wrapper" pattern already used
 * throughout the Express backend (e.g. `pincodeImport.ts`).
 */
export function handleHealthRequest(req: MinimalRequest, res: MinimalResponse): void {
  if (req.method !== 'GET') {
    res.status(405).json({
      success: false,
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET' },
    });
    return;
  }

  logger.info('Health check invoked', { emulator: isEmulator });

  const body: HealthResponseBody = {
    success: true,
    service: SERVICE_NAME,
    timestamp: new Date().toISOString(),
  };
  res.status(200).json(body);
}

/**
 * GET /health — the only Cloud Function shipped in Phase 1.
 *
 * Intentionally does nothing beyond confirming the Functions runtime is
 * reachable: no Firestore read, no Auth call, no secret access. This keeps
 * it usable as an uptime/liveness probe with the smallest possible blast
 * radius, and gives Phase 2+ a known-good template for every subsequent
 * HTTPS Function (structured logging, safe CORS, no leaked internals in
 * error responses).
 */
export const health = onRequest(
  {
    cors: isEmulator ? true : corsOrigins,
    memory: '128MiB',
    timeoutSeconds: 10,
    maxInstances: 10,
  },
  (req, res) => handleHealthRequest(req, res),
);
