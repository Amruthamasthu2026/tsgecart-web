import { z } from 'zod';
import { defineSecret } from 'firebase-functions/params';

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
 *
 * Phase 5 is that later phase for Razorpay: these `SecretParam`s are
 * DECLARED here but never resolved at module load — `.value()` is only
 * ever called inside a Function handler that has listed the secret in its
 * own `onCall({ secrets: [...] })`/`onRequest({ secrets: [...] })` options
 * (see payments/razorpay.function.ts), which is what makes the secret's
 * plaintext value available to that invocation at all. In production these
 * are set via `firebase functions:secrets:set RAZORPAY_KEY_SECRET` (Google
 * Secret Manager); in the emulator they're read from
 * `firebase/functions/.secret.local` (gitignored, never committed).
 */
export const razorpayKeyIdSecret = defineSecret('RAZORPAY_KEY_ID');
export const razorpayKeySecretSecret = defineSecret('RAZORPAY_KEY_SECRET');
export const razorpayWebhookSecretSecret = defineSecret('RAZORPAY_WEBHOOK_SECRET');

/**
 * Google Drive/Sheets bridge (Firestore → Drive → Sheets → Apps Script).
 * `APPS_SCRIPT_URL` is the deployed Apps Script web app's `/exec` URL;
 * `APPS_SCRIPT_SECRET` is a shared secret Apps Script's `doPost`/`doGet`
 * checks on every request (see google-apps-script/src/Config.gs). Both are
 * plain bridge configuration, not credentials to a third-party payment
 * processor, but they still go through Secret Manager like the Razorpay
 * secrets above — never `.env`, never committed, never read by any code
 * path reachable from the frontend. Only `drive/driveClient.ts` and
 * `sheets/sheetsClient.ts` ever call `.value()` on these, and only inside a
 * Function that lists them in its own `secrets: [...]` option.
 */
export const appsScriptUrlSecret = defineSecret('APPS_SCRIPT_URL');
export const appsScriptSecretSecret = defineSecret('APPS_SCRIPT_SECRET');

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
