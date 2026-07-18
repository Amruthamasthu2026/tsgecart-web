import { z } from 'zod';

/**
 * Environment validation for Cloud Functions.
 *
 * Phase 1 scope: only the flags needed to detect the emulator and shape CORS
 * for the health check. Real secrets (Razorpay, Cloudinary, SMTP) are NOT
 * read from process.env here — see docs/firebase-migration-audit.md §Firebase
 * Secrets Design and functions/README section "Secrets" for how those will
 * be wired via `firebase functions:secrets:set` + `defineSecret()` in a
 * later phase, once the functions that need them exist. Nothing in this
 * file ever logs or re-exports a secret value.
 */

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('production'),
  // Set automatically by the Firebase Emulator Suite; used to relax CORS and
  // enable verbose logging locally without any manual flag.
  FUNCTIONS_EMULATOR: z.string().optional(),
  FIRESTORE_EMULATOR_HOST: z.string().optional(),
  // Comma-separated allowlist for the health check's CORS policy. Defaults
  // cover local Vite dev and the Firebase Hosting emulator.
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173,http://localhost:5000'),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid Cloud Functions environment:', parsed.error.flatten().fieldErrors);
  throw new Error('Cloud Functions environment validation failed');
}

export const env = parsed.data;

export const isEmulator = Boolean(env.FUNCTIONS_EMULATOR || env.FIRESTORE_EMULATOR_HOST);

export const corsOrigins = env.CORS_ORIGINS.split(',')
  .map((o) => o.trim())
  .filter(Boolean);
