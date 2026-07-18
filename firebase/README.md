# TSG eCart — Firebase Migration

This directory contains a **Firebase implementation built alongside** the
existing Express/Prisma/MySQL backend in `../backend`. It does not replace
anything yet. See `../docs/firebase-migration-audit.md` for the full audit,
component-mapping table, proposed Firestore data model, and auth-migration
design that this foundation is built against.

**Progress so far:**
- **Phase 1 (Foundation):** project scaffold, emulator configuration,
  default-deny Firestore Security Rules, a health-check Cloud Function.
- **Phase 2 (Authentication):** Firebase Authentication + custom claims
  (CUSTOMER/STAFF/ADMIN/DELIVERY_PARTNER), added alongside the existing
  JWT auth — see `frontend/src/contexts/FirebaseAuthContext.tsx`.
- **Phase 3 (Catalog — products/categories):** `products`/`categories`
  Firestore collections, read-only Callable Functions, and a
  feature-flagged Firestore-backed frontend catalog surface — see
  "Catalog collections (Phase 3)" below.

No cart, orders, payments, wishlist, rewards, or coupons data has been
migrated. The existing backend keeps serving 100% of production traffic;
nothing here is live in production yet.

---

## Prerequisites

| Tool | Required version | Why |
|---|---|---|
| Node.js | 20.x (LTS) | Matches the `engines.node` target in `functions/package.json` — the deployed Cloud Functions runtime |
| Java | 11+ (JDK) | Required by the Firestore/Auth Local Emulator Suite |
| Firebase CLI | 13.x+ | Emulators, deploy, project management. Install globally (`npm install -g firebase-tools`) or use `npx firebase-tools` (no install) — this repo's scripts use `npx` so no global install is required |

Check what you have:

```bash
node --version   # should print v20.x (v22 also works for local tooling; deploy target stays 20)
java -version    # should print 11 or higher
npx firebase-tools --version
```

## One-time setup

```bash
# From the repository root
firebase login                       # or: npx firebase-tools login
cd firebase
cp .firebaserc.example .firebaserc   # then edit the "default" project ID — see below
```

`**.firebaserc**` is gitignored on purpose (see root `.gitignore`) — it is
never committed because it names your specific Firebase project. For local
emulator-only development, the project ID does not need to be real; the
emulator scripts below explicitly pass `--project=demo-tsgecart` so they
work without a `.firebaserc` at all. You only need a real project ID once
you deploy.

If you don't have a Firebase project yet:

```bash
firebase projects:create tsgecart-firebase-dev   # or use an existing GCP/Firebase project
```

## Local development — commands from the repository root

All Firebase-specific scripts are exposed from the **root** `package.json`
so they're discoverable alongside the existing `frontend`/`backend`
scripts, without touching those workspaces:

```bash
# Install Cloud Functions dependencies (separate from the root npm workspace
# on purpose — see "Why functions/ is not an npm workspace" below)
npm run firebase:install

# TypeScript typecheck (src/ + tests/)
npm run firebase:typecheck

# ESLint
npm run firebase:lint

# Production build (compiles src/ only, to firebase/functions/lib/)
npm run firebase:build

# Pure-logic unit tests (no emulator required)
npm run firebase:test

# Firestore Rules tests (spins up the Firestore emulator automatically,
# runs the rules test suite against it, then tears it down)
npm run firebase:test:rules

# Start the full Local Emulator Suite (Auth, Firestore, Functions, Hosting
# placeholder, Storage, Emulator UI) with demo project data
npm run firebase:emulator

# Export emulator state to firebase/.emulator-data (gitignored) so your next
# `emulator:import` run starts from the same data
npm run firebase:emulator:export

# Start the emulator suite pre-loaded from a previous export
npm run firebase:emulator:import
```

Equivalent commands run directly inside `firebase/functions/` (useful in an
editor terminal already `cd`'d there):

```bash
cd firebase/functions
npm install
npm run typecheck
npm run lint
npm run build
npm run test
npm run test:rules
```

And the emulator suite directly (from `firebase/`):

```bash
cd firebase
npx firebase-tools emulators:start --project=demo-tsgecart
```

Once running, open the **Emulator UI** at <http://localhost:4000> to browse
Firestore data, Auth users, and Functions logs interactively.

| Emulator | Port |
|---|---|
| Emulator UI | 4000 |
| Hosting (placeholder) | 5000 |
| Functions | 5001 |
| Firestore | 8080 |
| Auth | 9099 |
| Storage | 9199 |

`singleProjectMode` is enabled in `firebase.json`, so all emulators share one
in-memory project (`demo-tsgecart` by default) — no real Firebase project or
network access is required to develop and test locally.

## Verifying the health check locally

```bash
npm run firebase:emulator
# in another terminal:
curl http://localhost:5001/demo-tsgecart/us-central1/health
```

Expected response:

```json
{ "success": true, "service": "tsgecart-firebase", "timestamp": "2026-…" }
```

## Why `functions/` is not an npm workspace

The root `package.json` currently defines `frontend` and `backend` as npm
workspaces. `firebase/functions` is **deliberately excluded** from that list:
the Firebase CLI runs its own `npm install` inside `functions/` at deploy
time (and expects a self-contained `node_modules`), and hoisting Functions'
dependencies into the workspace root has been a recurring source of broken
deploys in the wider Firebase community when combined with npm/yarn/pnpm
workspaces. Keeping it a fully standalone package — invoked via `npm --prefix
firebase/functions run <script>` from the root scripts — avoids that failure
mode entirely while still giving you one-command access from the repo root.

## Directory structure

```
firebase/
├── firebase.json              Emulator ports, functions/rules/hosting config
├── .firebaserc.example         Placeholder project alias (copy to .firebaserc, gitignored)
├── firestore.rules            Default-deny Security Rules + role/permission helpers
├── firestore.indexes.json     Empty in Phase 1 — see docs/firebase-migration-audit.md §30 for planned future indexes
├── storage.rules              Default-deny (Storage is unused — Cloudinary retained, see audit §18)
├── hosting-placeholder/       Not wired to the real frontend build yet (see below)
├── functions/
│   ├── package.json
│   ├── tsconfig.json          Includes src/ + tests/ (typecheck)
│   ├── tsconfig.build.json    src/ only (production build output → lib/)
│   ├── eslint.config.js
│   ├── vitest.config.ts       Pure-logic unit tests
│   ├── vitest.rules.config.ts Firestore Rules tests (emulator-only)
│   ├── src/
│   │   ├── index.ts           Exports all deployed functions
│   │   ├── config/
│   │   │   ├── firebaseAdmin.ts   Lazy, single Admin SDK app instance
│   │   │   └── environment.ts     Zod-validated env, emulator detection
│   │   ├── shared/
│   │   │   ├── errors.ts          AppError hierarchy (HttpsError-compatible)
│   │   │   ├── logger.ts          Structured logging wrapper
│   │   │   ├── auth.ts            Callable-Function RBAC helpers (claims-only authority)
│   │   │   └── validation.ts      Zod input-parsing helper
│   │   └── health/
│   │       └── health.function.ts The only deployed function in Phase 1
│   └── tests/
│       ├── health.test.ts
│       ├── shared/
│       │   ├── errors.test.ts
│       │   ├── auth.test.ts
│       │   └── validation.test.ts
│       └── firestore.rules.test.ts
└── README.md                  This file
```

**`hosting-placeholder/`** exists only so `firebase.json`'s `hosting.public`
points at a valid directory — Firebase Hosting is **not** serving the real
frontend yet. The production frontend continues to be built by Vite and
served via the existing Nginx config (`../nginx/`) until a later, separately
approved migration phase explicitly cuts Hosting over.

## Secrets (design only — nothing is configured yet)

No secret is read, stored, or referenced by any function in Phase 1. When a
future phase adds Razorpay/Cloudinary/SMTP-dependent functions, secrets will
be provisioned via **Firebase Functions secrets** (backed by Google Secret
Manager), never via a committed `.env` file and never copied from the
existing backend's `.env`:

```bash
# Example commands only — run these when the corresponding function is
# actually implemented, not now:
firebase functions:secrets:set RAZORPAY_KEY_ID
firebase functions:secrets:set RAZORPAY_KEY_SECRET
firebase functions:secrets:set RAZORPAY_WEBHOOK_SECRET
firebase functions:secrets:set CLOUDINARY_CLOUD_NAME
firebase functions:secrets:set CLOUDINARY_API_KEY
firebase functions:secrets:set CLOUDINARY_API_SECRET
firebase functions:secrets:set SMTP_USER
firebase functions:secrets:set SMTP_PASS
```

Each function that needs a secret will declare it explicitly via
`defineSecret()` from `firebase-functions/params` and list it in that
function's options (`{ secrets: [RAZORPAY_KEY_SECRET] }`) — this is the
Firebase-native equivalent of the backend's current `env.ts` Zod validation,
but scoped per-function so a function that doesn't need a given secret never
has it injected into its environment at all.

## App Check (design only — not enforced in Phase 1)

Firebase App Check will be enabled in a later phase to attest that requests
to Callable Functions/Firestore genuinely originate from the real TSG eCart
web app (reCAPTCHA Enterprise or v3 provider for the web frontend). It is
**not** enabled now, deliberately: App Check enforcement would block the
Local Emulator Suite's normal unauthenticated local testing unless every
developer machine is also configured with debug tokens, which is unnecessary
friction for a foundation-only phase with no real Callable Functions yet.
When enabled:

- Web frontend: `initializeAppCheck()` in `frontend/src/lib/firebase.ts` (not
  created yet — see "Frontend integration plan" below) with a reCAPTCHA
  provider.
- Callable Functions: `{ enforceAppCheck: true }` added to each function's
  options once the frontend is verified to be sending tokens correctly.
- Firestore: App Check enforcement toggled per-database in the Firebase
  Console (or via the Admin API), after Rules-based access is already
  correctly scoped — App Check is an additional attestation layer, not a
  replacement for Security Rules.
- Local emulator development will continue to work throughout, using
  App Check's official debug-token mechanism, documented at the point it's
  actually wired up.

## Frontend integration plan (design only — not implemented, no frontend files changed)

Nothing in `frontend/` was modified this session. When the frontend
migration begins (a later, separately approved phase), the plan is:

- `frontend/src/lib/firebase.ts` — initializes the Firebase Web SDK
  (`initializeApp`, `getAuth`, `getFirestore`, `getFunctions`), reading
  config from `VITE_FIREBASE_*` environment variables (public, client-safe
  config — Firebase web config is not a secret).
- A new `AuthService` abstraction wrapping `onIdTokenChanged`,
  `signInWithEmailAndPassword`, `signOut`, `getIdTokenResult` — swapped in
  behind the existing `AuthContext` interface so components using
  `useAuth()` do not need to change.
- A `FirestoreService` abstraction per domain (mirroring the current
  `features/*/​*.api.ts` file-per-domain pattern) so each domain can be
  migrated independently — e.g. `features/catalog/catalog.firestore.ts`
  alongside the existing `catalog.api.ts`, switched via a single import
  change once verified.
- A Callable-Functions client wrapper (`lib/callable.ts`,
  `httpsCallable(functions, name)`) replacing `apiClient.post/get/...` calls
  one feature module at a time.
- The existing Axios-based REST client (`lib/apiClient.ts`) is **not**
  removed until every feature module that depends on it has an equivalent
  Firebase-backed implementation verified in production.

No current frontend API calls, routes, UI, or authentication behavior change
in this session.

*(The plan above was written during Phase 1. Phase 2 implemented the
Firebase Auth pieces — see `frontend/src/contexts/FirebaseAuthContext.tsx`,
`frontend/src/lib/firebase.ts`. Phase 3 implements the catalog pieces — see
the next section.)*

## Catalog collections (Phase 3 — products/categories)

`products/{slug}` and `categories/{slug}` are the first real Firestore
collections in this migration (doc ID = slug, matching
`docs/firebase-migration-audit.md` §30's stated rationale — slug lookup is
a direct `doc().get()`, never a query, so it needs no index).

**Deviation from §30, recorded here on purpose:** §30 documents `products`
explicitly *not* embedding variants, with a separate `productVariants`
collection. Phase 3 only covers browsing (product/category listing and
detail) — full per-variant selection and cart integration are out of scope
for this phase (see the Phase 3 instructions: "Do not continue to Cart...
yet"). Rather than build a variants collection nothing yet reads from,
`products/{slug}` instead carries a denormalized `defaultVariant` snapshot
(`sku`, `unitLabel`, `mrpPaise`, `pricePaise`, `stock`) plus
`minPricePaise`/`maxPricePaise` for sorting/filtering. The real
`productVariants` collection — multiple variants per product, live
inventory, cart line items — is real remaining work for the phase that
migrates Cart/Orders, not a decision that's been made and closed.

**Read/write access** (`firestore.rules`): public read of `isActive: true`
documents; STAFF/ADMIN holding the `products.manage` claim/permission get
full read (including inactive) and all writes. As with every other
collection in this file, authority is exclusively the caller's custom
claims — never a document field, never an email check.

**Functions** (`firebase/functions/src/catalog/`): `getProducts`,
`getProductBySlug`, `getFeaturedProducts`, `getTrendingProducts`,
`getCategories` — all public Callable Functions, all read-only.
`getTrendingProducts` replicates (server-side, as one reusable function)
the fallback chain the frontend's `HomePage` already implemented
client-side: bestSeller → featured → newest. There is no `isTrending`
field anywhere — "trending" has never been a real field in this app, only
a UI selection rule (see the Phase 3 completion report for the research
that established this).

**Indexes** (`firestore.indexes.json`): covers the query combinations
Functions above actually issue — sort by each of createdAt/name/
ratingAvg/price, featured, bestSeller, category filter (alone and combined
with price-sort/name-sort), and the categories listing order. The
Firestore emulator does not enforce indexes (queries succeed locally
without them), so the emulator test suite passing is not proof every
production query path is indexed — a query combination outside this list
run against a **real, non-emulator** Firestore project will fail with an
error that includes a direct console link to create the missing index.

**Migration scripts** (not executed as part of this migration, per the
same rule Phase 2's user-import scripts follow):
- `backend/scripts/exportProductsFromMysql.ts` — read-only MySQL export.
- `firebase/functions/scripts/importProductsToFirestore.ts` — dry-run by
  default; `--execute` performs the real Firestore writes.

The sample data used for local emulator testing/manual verification during
Phase 3 was a small hand-authored fixture (not a real MySQL export, since
this sandbox has no live MySQL to export from) — see the Phase 3 completion
report for exactly what was seeded and how.

**Frontend** (`frontend/src/services/firebaseProducts.ts`): a new,
separate service calling the Callable Functions above — it does not modify
or replace `features/catalog/catalog.api.ts`. `VITE_USE_FIRESTORE_PRODUCTS=true`
switches the Home/Products/Product-detail pages to this service (via a
small adapter that reshapes the Firestore response into the exact `Product`
type `ProductCard` and the rest of the existing rendering code already
expect, so no rendering code needed to change). Leaving the flag unset (the
default) keeps every page on the existing Express API, unchanged.
