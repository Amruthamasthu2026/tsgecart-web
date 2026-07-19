# TSG eCart — Firebase Migration Audit (Phase 0)

**Status:** Design/audit document only. No production code, database, or data was changed to produce this document.
**Branch:** `firebase-migration`
**Audit date:** 2026-07-18
**Author:** Claude (Firebase migration session)

This document is the required output of Phase 0. It inventories the current Express/Prisma/MySQL/Redis application in detail, defines a component-by-component Firebase mapping, proposes a Firestore data model (design only — no data migrated), and documents an authentication-migration strategy (design only — not implemented). Phase 1 (Firebase project foundation) builds on this audit and is described in `firebase/README.md`.

---

## 1. Current Architecture Summary

TSG eCart is an npm-workspaces monorepo with two applications:

```
tsgecart-web/
├── backend/     Express 4 + TypeScript + Prisma ORM + MySQL 8 + Redis 7
├── frontend/    React 19 + Vite + TypeScript + Tailwind + React Router + React Query
├── nginx/       Reverse proxy (prod)
└── docker-compose.yml
```

**Backend layering** (per feature module under `backend/src/modules/<feature>/`):

```
Route → Middleware (auth, RBAC, validate, rateLimit) → Controller → Service → Repository → Prisma → MySQL
```

- **Controllers** — HTTP only (parse request, call service, shape response).
- **Services** — business rules, orchestration, Prisma `$transaction` blocks.
- **Repositories** — the only layer touching Prisma directly (products, users, auth, cart, categories modules use this pattern explicitly; simpler modules like brands/banners/delivery/coupons/reviews/rewardspin inline Prisma calls directly in the route file for brevity, but still route through services/validators).
- **Validators** — Zod schemas, applied via a generic `validate({ body, query, params })` middleware.
- **Cross-cutting** — centralized `errorHandler`, `pino` request logging, `env.ts` (Zod-validated config), standard response envelope `{ success, data, meta? }` / `{ success: false, error }`.

**Auth model:** JWT access token (15 min, `Authorization: Bearer`) + rotating JWT+opaque-secret refresh token stored **hashed** in MySQL (`RefreshToken` table) and delivered via a signed httpOnly cookie. Passwords hashed with bcrypt (12 rounds). RBAC via a `Role` enum (`CUSTOMER`/`STAFF`/`ADMIN`) plus a granular `Permission` + `UserPermission` join table for STAFF (ADMIN bypasses all permission checks).

**Data store:** MySQL 8 via Prisma ORM, 36 models (see §3). Money fields are `Decimal`. Two migrations exist: `20260717052902_init` (the real, currently-applied baseline — **contains live production data, must not be touched**) and `20260718000000_add_reward_spin` (additive, adds two new tables only).

**Cache:** Redis 7 used for exactly one purpose — caching pincode-serviceability lookups (`delivery.service.ts`, 5-minute TTL, invalidated on write) plus a health-check ping. **Redis is not used for sessions, rate limiting, or job queues.** Rate limiting uses `express-rate-limit`'s in-memory store (no Redis backing) — this means rate limits currently reset on server restart and don't share state across horizontally-scaled instances, a pre-existing limitation not introduced by this audit.

**External services:** Razorpay (Standard Checkout — orders, signature verification, webhook, refunds), Cloudinary (image uploads via Multer memory storage → `cloudinary.uploader.upload_stream`), SMTP via Nodemailer (verification/reset emails, no-ops gracefully if unconfigured).

**Frontend:** React 19 + Vite SPA. `AuthContext` holds the access token **in memory only** (never localStorage) and restores the session on load via `POST /auth/refresh` (cookie-based). `CartContext` wraps React Query. Axios client (`lib/apiClient.ts`) auto-attaches the bearer token and transparently retries once on 401 via the refresh endpoint. Route-level code splitting via `React.lazy`. `ProtectedRoute` component gates both authenticated-customer routes and the `/admin/*` tree (`roles={['ADMIN','STAFF']}`), reading `user.role` from `AuthContext` — no email-based checks anywhere in the codebase (verified by grep).

---

## 2. Complete API Route Inventory

All routes are mounted under `/api/v1` in `backend/src/routes/index.ts`. Format: `METHOD /api/v1/<mount>/<path>` — **[public]**, **[auth]** (any authenticated user), **[owner]** (authenticated + resource-ownership check in the service layer), or **[STAFF/ADMIN: permission]** (RBAC-gated via `requirePermission` or `requireRole`).

### 2.1 Auth (`/auth`) — `modules/auth`
| Route | Access | Notes |
|---|---|---|
| `POST /auth/register` | public (rate-limited) | Creates user + cart + wishlist + referral link in one transaction |
| `POST /auth/login` | public (rate-limited) | |
| `POST /auth/refresh` | public (cookie-based) | Rotates refresh token; detects reuse and revokes the token family |
| `POST /auth/logout` | public | Revokes the presented refresh token |
| `POST /auth/verify-email` | public | Consumes a hashed, expiring token |
| `POST /auth/resend-verification` | auth (rate-limited) | |
| `POST /auth/forgot-password` | public (rate-limited) | Always returns success (no email enumeration) |
| `POST /auth/reset-password` | public (rate-limited) | Revokes all refresh tokens on success |
| `GET /auth/me` | auth | |

### 2.2 Users (`/users`) — `modules/users`
All routes require auth. `PATCH /users/me`, `POST /users/me/change-password`, `GET/POST /users/me/addresses`, `PUT/DELETE /users/me/addresses/:id` (default-address logic transactional).

### 2.3 Categories (`/categories`) — `modules/categories`
`GET /` and `GET /:slug` public; `POST/PUT/DELETE` → `products.manage`. Tree-building + collision-safe slugs.

### 2.4 Brands (`/brands`) — `modules/brands`
Same shape as categories, `products.manage`-gated writes.

### 2.5 Products (`/products`) — `modules/products`
`GET /` (search/filter/sort/paginate, public), `GET /:slug` (public, includes variants + inventory + approved reviews), `POST/PUT/DELETE` → `products.manage`. Create/update run inside a transaction that also creates `ProductVariant` + `Inventory` rows.

### 2.6 Uploads (`/uploads`) — `modules/uploads`
`POST /` → `products.manage`. Multer memory buffer → Cloudinary `upload_stream`, 5 MB limit, image MIME allowlist.

### 2.7 Cart (`/cart`) — `modules/cart`
All routes auth-gated and implicitly owner-scoped (cart looked up by `userId`, never by cart ID from the client). `GET /`, `POST /items`, `PATCH /items/:itemId`, `DELETE /items/:itemId`, `DELETE /`, `POST /checkout-summary` (composes delivery + coupon + totals, read-only).

### 2.8 Wishlist (`/wishlist`) — `modules/wishlist`
Auth-gated, owner-scoped. `GET /`, `POST /items`, `DELETE /items/:productId`.

### 2.9 Delivery (`/delivery`) — `modules/delivery`
- `GET /check/:pincode` **[public]** — Redis-cached serviceability + zone/ETA lookup. This is the "Hyderabad only" gate.
- Admin (`delivery.manage`): zones, pincodes, localities CRUD; **bulk** endpoints added this session: `POST /pincodes/bulk` (paste/CSV import, transactional, skip-or-upsert), `POST /pincodes/import-hyderabad` (loads a maintained CSV — `backend/prisma/data/hyderabad-pincodes.csv`, not hardcoded in a component), `POST /pincodes/bulk-action` (activate/deactivate/move/delete many).

### 2.10 Coupons (`/coupons`) — `modules/coupons`
- `POST /apply` **[auth]** — validates against the live cart; `couponsService.evaluate()` checks global `Coupon` records first, then falls back to a user's `RewardCoupon` (spin-wheel reward) records. Returns a discriminated union (`kind: 'GLOBAL' | 'REWARD'`).
- Admin CRUD → `coupons.manage`.

### 2.11 Orders (`/orders`) — `modules/orders`
All auth + owner-scoped. `POST /` (the critical transactional order-creation path, see §7), `GET /`, `GET /:id`, `GET /:id/invoice`, `POST /:id/cancel` (restocks inventory).

### 2.12 Admin Orders (`/admin/orders`) — `modules/orders/adminOrders.routes.ts`
`orders.manage`-gated. `GET /` (search/filter), `PATCH /:id/status` (state-machine guarded transitions, auto-settles COD on DELIVERED, restocks on CANCELLED, triggers referral completion), `POST /:id/refund`.

### 2.13 Payments (`/payments`) — `modules/payments`
- `POST /payments/razorpay/verify` **[auth]** — HMAC signature check against the order's stored `razorpayOrderId`.
- `POST /payments/webhook` **[public, signature-verified]** — raw body captured pre-JSON-parse in `app.ts`; handles `payment.captured`, `payment.failed`, `refund.processed`.

### 2.14 Reviews (`/reviews`) — `modules/reviews`
`POST /` **[auth]** — purchase-verified (must have a DELIVERED order containing the product). `GET /mine` **[auth]**. Admin moderation (`GET/PATCH/DELETE /admin/*`) → `reviews.manage`; approval recomputes the product's denormalized `ratingAvg`/`ratingCount`.

### 2.15 Notifications (`/notifications`) — `modules/notifications`
Auth-gated, owner-scoped. `GET /`, `POST /:id/read`, `POST /read-all`.

### 2.16 Rewards — wallet & referral (`/rewards`) — `modules/rewards`
Auth-gated. `GET /wallet` (running-balance ledger), `GET /referral` (summary + history).

### 2.17 Spin — legacy config wheel (`/spin`) — `modules/spin`
Auth for `GET /`, `POST /spin`; `rewards.manage` for admin segment CRUD. **Note:** this is the original wheel-config model (`SpinWheelConfig`/`SpinSegment`/`SpinHistory`) seeded with a wallet-credit reward. It now coexists with the newer coupon-issuing wheel below — see §12 for the reconciliation note.

### 2.18 Reward-Spin — coupon-issuing wheel (`/rewards-spin`) — `modules/rewardspin`
Added this session, additive. `GET /wheel`, `POST /spin` (1 per 24h, issues a unique single-use `RewardCoupon`), `GET /mine`. Admin (`rewards.manage`): `GET/POST/PUT/DELETE /admin/configs` (tiers, probability), `POST /admin/seed-defaults`, `GET /admin/analytics`.

### 2.19 Banners (`/banners`) — `modules/banners`
`GET /` public (scheduled window filter), admin CRUD → `banners.manage`.

### 2.20 Discovery (`/discovery`) — `modules/discovery`
`POST/GET /recently-viewed` (auth), `GET /recommendations` (optional auth — category-based when signed in, best-sellers otherwise), `GET /related/:slug` (public).

### 2.21 Admin (`/admin`) — `modules/admin`
`dashboard.view`: `GET /analytics/dashboard`, `/analytics/sales`, `/analytics/top-products`. `inventory.manage`: `/analytics/low-stock`, `PATCH /inventory/:variantId`. `customers.manage`: `GET/PATCH /customers*`. `settings.manage`: `GET/PUT /settings/:key`, `GET /permissions`, `GET /staff`. `requireRole('ADMIN')` only: `PATCH /users/:id/role` (role + permission assignment).

### 2.22 SEO (`/` — root, not versioned) — `modules/seo`
`GET /sitemap.xml` — dynamic, built from active categories/products.

### 2.23 Health
`GET /api/v1/health` — pings MySQL + Redis.

**Total: ~120 individual route handlers across 21 feature modules.**

---

## 3. Prisma Model Inventory (36 models, 10 enums)

Grouped by domain; ★ = has at least one `@@index` beyond the primary key; 🔒 = contains a unique constraint enforcing a business rule.

**Identity & Access:** `User`★🔒 (email, phone, referralCode unique), `Permission`🔒(key), `UserPermission` (composite PK), `RefreshToken`★🔒(tokenHash), `VerificationToken`★🔒(tokenHash), `Address`★

**Catalog:** `Category`★🔒(slug), `Brand`🔒(slug), `Product`★🔒(slug), `ProductVariant`★🔒(sku), `Inventory`🔒(variantId), `Review`★🔒(userId+productId composite — one review per user per product)

**Cart & Wishlist:** `Cart`🔒(userId), `CartItem`★🔒(cartId+variantId), `Wishlist`🔒(userId), `WishlistItem`★🔒(wishlistId+productId)

**Commerce:** `Coupon`★🔒(code), `CouponRedemption`★, `DeliveryZone`★, `Pincode`★🔒(code), `Locality`★

**Orders & Payments:** `Order`★🔒(orderNumber), `OrderItem`★, `OrderStatusHistory`★, `Payment`★🔒(orderId, razorpayOrderId, razorpayPaymentId)

**Engagement:** `Referral`★🔒(refereeId — one referral per new user), `WalletTransaction`★, `SpinWheelConfig`, `SpinSegment`★, `SpinHistory`★, `Notification`★, `Banner`★, `RecentlyViewed`★🔒(userId+productId)

**Settings:** `Setting`🔒(key)

**Rewards (new, additive):** `RewardConfig`★, `RewardCoupon`★🔒(code)

**Enums:** `Role`, `AddressType`, `CouponType`, `OrderStatus`, `PaymentMethod`, `PaymentStatus`, `NotificationType`, `WalletSource`, `ReferralStatus`, `RewardCouponStatus`

**Design patterns relevant to migration:**
- **Order/OrderItem snapshotting** — `OrderItem` stores `productName`, `variantLabel`, `sku`, `unitPrice`, `gstRate` as copied values, not references; `Order` stores the full shipping address inline. This means historical orders are immutable and don't need to "join" to current product/address state — **directly compatible with Firestore's denormalized-document model.**
- **Decimal money fields** — Prisma `Decimal(10,2)` throughout. Firestore has no native fixed-point decimal type; amounts must be stored as integer paise/minor-units or as strings with app-level decimal math (see §11, `RewardConfig`/`RewardCoupon`).
- **Composite unique constraints** double as idempotency/business-rule guards (e.g., `CartItem(cartId, variantId)`, `Review(userId, productId)`). These map naturally to deterministic Firestore document IDs (see §12).

---

## 4. Redis Usage Inventory

| Site | Operation | Purpose | TTL |
|---|---|---|---|
| `delivery.service.ts:checkServiceability` | `GET delivery:pincode:{code}` | Cache-first serviceability lookup | 5 min |
| `delivery.service.ts:checkServiceability` | `SETEX` after DB read | Populate cache | 5 min |
| `delivery.service.ts:invalidatePincodeCache` | `DEL` | Called after every admin write to a `Pincode` row (single or bulk) | — |
| `routes/index.ts` health check | `PING` | Liveness probe | — |

**That is the entire Redis footprint.** No sessions, no queues, no pub/sub, no distributed locks. This significantly de-risks the migration: Redis can be replaced by a small Firestore document (`platformCache/pincode_{code}`) with a `expiresAt` field checked at read time, or removed entirely in favor of Firestore's own read performance — a decision to make in Phase 3, not now.

---

## 5. Authentication & Refresh-Token Flow (current)

1. **Register/Login** → bcrypt-verify or bcrypt-hash password → issue access JWT (`{ sub, role, email }`, 15 min, `JWT_ACCESS_SECRET`) + refresh JWT (`{ sub, tokenId }`, 30 day, `JWT_REFRESH_SECRET`). The refresh JWT's *raw opaque secret* is concatenated client-side (`${jwt}.${rawSecret}`) and only the **hash** of the raw secret is stored in `RefreshToken.tokenHash`.
2. Refresh token delivered via **signed httpOnly cookie**, scoped to `/api/v1/auth`, `sameSite: lax`, `secure` in production.
3. **Refresh** → verify JWT signature + expiry → look up `RefreshToken` row by `tokenId` → compare `hashToken(rawSecret)` to the stored hash → **on mismatch, revoke the entire token family** (reuse-detection) → on success, **rotate**: revoke the used row, issue a brand-new pair.
4. **Logout** → revoke the presented refresh token only.
5. Frontend never persists the access token to storage; it lives in a module-level variable in `apiClient.ts` and is re-acquired via silent `POST /auth/refresh` on app load (`AuthContext` effect) and transparently on any 401 (single in-flight refresh, queued retries).

**Firebase mapping implication:** Firebase ID tokens (1 hour, auto-refreshed by the client SDK) + refresh tokens (managed entirely by Firebase, never touched by app code) replace *both* halves of this system. The reuse-detection/rotation logic becomes unnecessary — Firebase Auth's refresh-token revocation (`admin.auth().revokeRefreshTokens(uid)`) is the direct equivalent of "revoke all sessions on password change." See §14.

---

## 6. Email Verification & Password Reset (current)

Both use the same `VerificationToken` table (`type: 'EMAIL_VERIFY' | 'PASSWORD_RESET'`), a random opaque token, SHA-256 hashed at rest, single-use (`usedAt`), expiring (24h verify / 1h reset). Emails sent via Nodemailer with inline-HTML branded templates; no-op with a log line if SMTP is unconfigured (never blocks the request).

**Firebase mapping:** Firebase Auth has native `sendEmailVerification` and `sendPasswordResetEmail` (via client SDK, using Firebase's own hosted action-handler pages, or custom via Admin SDK `generateEmailVerificationLink`/`generatePasswordResetLink` + your own SMTP for full branding parity). This entire module (and its `VerificationToken` table) can be **deleted** once migrated — no Firestore equivalent needed.

---

## 7. RBAC & Permissions (current)

- `Role` enum on `User`: `CUSTOMER` (default) / `STAFF` / `ADMIN`.
- `Permission` catalog (11 keys, e.g. `products.manage`, `orders.manage`, `dashboard.view`) + `UserPermission` join table, assignable per-STAFF-user by an ADMIN via `PATCH /admin/users/:id/role`.
- `authenticate` middleware loads the user + permissions **fresh from the DB on every request** (not just from the JWT) — so a permission revoked mid-session takes effect on the next request, not after token expiry. This is a deliberate freshness/latency tradeoff.
- `requireRole('ADMIN')` and `requirePermission(key)` middlewares; `ADMIN` role implicitly passes every permission check.
- Frontend: `ProtectedRoute roles={[...]}` reads `user.role` from `AuthContext`; Navbar/AccountPage show admin entry points only when `role === 'ADMIN' || 'STAFF'`. **No email-based gating anywhere** (confirmed by full-repo grep during this audit — zero matches for hardcoded admin email checks in application logic).

**Firebase mapping:** Firebase custom claims (`{ role: 'ADMIN', permissions: [...] }`) set via Admin SDK, verified server-side in every Callable/HTTPS Function via `context.auth.token`, and used directly in Firestore Security Rules (`request.auth.token.role == 'ADMIN'`). The "fresh permission check" behavior requires a deliberate design choice — see §14 (token refresh after role change).

---

## 8. Product & Inventory Flows

- Products have 1..N `ProductVariant`s (unit/SKU/MRP/price), each with exactly one `Inventory` row (`stock`, `reserved`, `lowStockThreshold`).
- Stock is decremented **inside the order-creation transaction** (§9) and incremented back on cancellation/admin-cancel — never adjusted outside a transaction.
- `Product.ratingAvg`/`ratingCount` are denormalized aggregates, recomputed by the reviews-approval flow (`prisma.review.aggregate` → `product.update`).
- Bulk admin operations (pincode import, this session) demonstrate the project's established pattern: a **pure, DB-free planner function** (validate/dedupe/plan) + a **service that loads state, calls the planner, and applies the result in one transaction** — directly reusable as the template for Firestore batched-write functions.

---

## 9. Cart & Wishlist Flows

Both are 1:1-with-user singleton documents (`Cart`/`Wishlist`) each owning a child collection (`CartItem`/`WishlistItem`) uniquely constrained on `(parentId, variantId|productId)`. Cart totals (subtotal, embedded-GST breakup, per-line stock/availability) are computed **server-side on every read** (`cartService.getCart`) — the frontend never computes or trusts prices. This is the single most important pattern to preserve exactly in the Firebase migration (see §16, "must never be directly writable by customers").

---

## 10. Delivery & Pincode Validation

`GET /delivery/check/:pincode` is the customer-facing gate: looks up `Pincode → DeliveryZone`, returns `{ serviceable, message, zone: { deliveryCharge, freeDeliveryLimit, minEtaMinutes, maxEtaMinutes } }`, Redis-cached. If not serviceable, returns the exact required message: *"Sorry, TSG eCart currently delivers only within Hyderabad."* This same check is re-run **server-side at order-placement time** (`orders.service.ts`) — never trusted from a prior cart-page check — a pattern that must be preserved 1:1 in any Firebase Function that creates orders.

Admin-side: zones/pincodes/localities are fully code-free — configurable via CRUD or the bulk-import system (paste/CSV/Hyderabad-CSV-seed/bulk actions) added this session, backed by a pure planner (`pincodeImport.ts`, unit-tested for duplicates/invalid/existing/inactive-zone/large-batch scenarios).

---

## 11. Coupon Logic

`couponsService.evaluate(code, userId, subtotal)`:
1. Look up `Coupon` by code (uppercased). If found: check `isActive`, `startsAt`/`expiresAt` window, `minOrder`, global `usageLimit` vs `usedCount`, per-user `perUserLimit` vs a `CouponRedemption` count. Compute discount (`PERCENTAGE` capped by `maxDiscount`, or `FLAT`), clamp to subtotal.
2. If no global coupon matches, fall back to `rewardSpinService.evaluateForCheckout` — checks a `RewardCoupon` by code: ownership (`userId` match), `status === 'ACTIVE'`, expiry, `minOrder`. This is the integration point added this session; **global coupon behavior is byte-for-byte unchanged**.

Redemption is recorded transactionally at order-placement time, never at "apply" time (apply is a read-only preview).

---

## 12. Spin Reward Logic — two coexisting systems (flag for Phase 2 decision)

The codebase currently has **two parallel spin-wheel implementations** that a Firebase migration must reconcile:

1. **Legacy wallet wheel** (`modules/spin`, `SpinWheelConfig`/`SpinSegment`/`SpinHistory`) — weighted random segment, credits the user's `WalletTransaction` ledger directly, 24h cooldown per user based on `SpinHistory.createdAt`.
2. **New coupon wheel** (`modules/rewardspin`, `RewardConfig`/`RewardCoupon`, added this session per explicit user request) — weighted random tier, **issues a unique single-use `RewardCoupon`** (not a wallet credit), 24h cooldown based on `RewardCoupon.createdAt`, 3-day expiry, redeemed via the coupon-apply flow at checkout.

Both are live in the codebase and routed (`/spin` and `/rewards-spin` respectively); the frontend `RewardsPage` currently renders the **coupon wheel** (system 2). System 1 remains reachable via its own admin UI (`AdminDashboard` segment management) but is not surfaced on the current customer Rewards page.

**This audit recommends System 2 (coupon-issuing) as the canonical model going forward**, since it matches the most recent explicit product requirement (unique single-use coupon, ownership, expiry). **Decision needed before Phase 2 data-model finalization:** deprecate System 1's tables/routes, or keep both. Documented here as a risk, not resolved in this session.

---

## 13. Order Creation (the most transaction-critical operation in the app)

`ordersService.create()` — single Prisma `$transaction`:
1. Re-fetch the live cart (never trust client-submitted line items).
2. Re-validate delivery serviceability for the chosen address's pincode (§10).
3. Re-validate stock for every line (`inStock && quantity <= availableStock`).
4. Evaluate coupon (global or reward, §11) and wallet redemption (partial or full).
5. Compute `subtotal`, `discount`, `deliveryCharge`, `walletUsed`, `total` **entirely server-side**.
6. Create `Order` + `OrderItem[]` (snapshotted) + initial `OrderStatusHistory` + `Payment` (status depends on method and whether wallet fully covers the total) in one write.
7. Debit the wallet (if used), decrement inventory per line, record coupon/reward redemption, clear the cart — **all inside the same transaction**. If any step throws, the entire transaction rolls back (no partial stock decrement, no orphaned payment row).
8. **After** the transaction commits: for `RAZORPAY` orders with a non-zero payable amount, create a Razorpay order and attach its ID to the `Payment` row (a second, non-transactional write — acceptable because it's an external-API side effect that can't be part of a DB transaction anyway; a failure here throws and the order remains in a `PENDING`-payment state, recoverable).

This is the operation with the highest fan-out of side effects (stock, wallet, coupon, cart, notification, referral-completion-on-delivery) and is the strongest argument in the entire audit for **requiring Firestore transactions or the equivalent atomic-batch pattern** in the Firebase implementation — see §17.

---

## 14. COD / Razorpay Order Creation / Signature Verification / Webhook / Refunds

- **COD**: `Payment.status = 'PENDING'`, settled to `PAID` automatically when an admin transitions the order to `DELIVERED`.
- **Razorpay order creation**: server creates the Razorpay order (amount in paise) only *after* the local `Order`+`Payment` rows exist, using `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` — **never exposed to the frontend**; only `keyId` (public) is returned to the client for Checkout.js.
- **Signature verification** (`config/razorpay.ts`): timing-safe HMAC-SHA256 comparison of `orderId|paymentId` against `X-Razorpay-Signature`-equivalent client payload, using `RAZORPAY_KEY_SECRET`.
- **Webhook** (`POST /payments/webhook`): raw body captured pre-JSON-parse specifically for this route (`app.ts`); HMAC-SHA256 verified against `RAZORPAY_WEBHOOK_SECRET`; handles `payment.captured`/`payment.failed`/`refund.processed` idempotently (`updateMany` with a status-guard where clause).
- **Refunds**: admin-only (`orders.manage`), calls `razorpay.payments.refund()`, tracks partial-vs-full via `Payment.refundedAmount`.

**Firebase mapping:** This entire subsystem maps to **HTTPS Cloud Functions** (not Callable) because Razorpay's webhook must receive a raw, unauthenticated POST with its own signature scheme — Callable Functions wrap requests in Firebase's own envelope and are unsuitable here. Verify/refund can be Callable (authenticated Firebase users) or HTTPS (matching the current REST shape) — recommendation: Callable, for consistent App Check + custom-claim enforcement.

---

## 15. Admin APIs, Analytics, Notifications, Wallet & Referrals

- **Analytics** (`modules/admin/analytics.service.ts`): `dashboard()` aggregates paid revenue, order/customer/product counts, order-status group-by; `salesTrend(days)` buckets orders by day in JS (not SQL `GROUP BY DATE`) — fetches raw rows and buckets client-side, which is actually **closer to a Firestore-friendly pattern already** (no SQL-specific date functions relied upon); `topProducts()` groups `OrderItem` by `productName`; `lowStock()` compares `Inventory.stock` to `Inventory.lowStockThreshold` via a raw Prisma field-reference filter (`{ stock: { lte: prisma.inventory.fields.lowStockThreshold } }`) — this specific comparison-between-two-fields-on-the-same-document is **not directly expressible in a single Firestore query** and will need either a denormalized boolean flag (`isLowStock`, updated on every stock write) or a Cloud Function that recomputes it periodically. Flagged as a migration risk in §19.
- **Notifications**: simple owned collection, created as a side effect of order-placement/status-change/referral-completion — trivially maps to a Firestore subcollection with a Cloud Function trigger replacing the current inline `notificationsService.create()` calls.
- **Wallet**: append-only ledger (`WalletTransaction`) with a **running balance stored on each row** (`balanceAfter`), computed by reading the latest row and adding — this "read-latest, compute-next, write" pattern is a textbook Firestore-transaction use case (see §17) to prevent race conditions from concurrent spins/orders/refunds.
- **Referrals**: one referral per new user (`refereeId` unique), completed (both parties credited) on the referee's **first delivered order** — triggered from inside `updateStatus()`'s `DELIVERED` branch.

---

## 16. Scheduled Jobs, Cooldowns, Cache Invalidation

- **No scheduled/cron jobs exist in the current codebase.** (Confirmed — no `node-cron`, no queue library, no background workers.)
- **Cooldowns**: both spin systems compute cooldown by querying `MAX(createdAt)` for the user's spin-history-equivalent table and comparing to `now`. No Redis, no locks — relies on the DB's transactional isolation plus the fact that a spin's core mutation (segment/tier selection + history/coupon row creation) happens inside a Prisma transaction.
- **Cache invalidation**: exactly one cache (pincode serviceability, §4), explicitly invalidated on every write path that touches a `Pincode` row (single create/update/delete and all three bulk endpoints).

---

## 17. Transactions & Atomic Operations — full inventory

Every `prisma.$transaction(...)` call in the codebase, because each one is a candidate for a Firestore `runTransaction()`:

| Location | What it protects |
|---|---|
| `auth.repository.createUserWithProfile` | User + Cart + Wishlist + Referral created atomically on register |
| `users.repository.createAddress` / `updateAddress` | Default-address exclusivity (only one `isDefault: true` per user) |
| `products.repository.createWithVariants` | Product + N variants + N inventory rows |
| `products.service.update` (when variants provided) | Replace-all-variants: delete + recreate + reinventory |
| `delivery.bulk.service.bulkImport` | Bulk pincode create/update applied as one unit |
| `orders.service.create` | **The big one** — see §13, 8 side effects in one transaction |
| `orders.service.cancel` | Status update + restock, atomic |
| `orders.service.updateStatus` (DELIVERED branch) | Payment settle + referral completion |
| `wallet.service.adjust` | Read-latest-balance + write-next-row (accepts an optional external `tx` so it can join a caller's transaction, e.g. order placement, spin reward) |
| `referral.service.completeForReferee` | Referral status update + two wallet credits |
| `spin.service` (legacy) / `rewardSpin.service` (new) | Cooldown check + history/coupon row + (legacy) wallet credit, atomic |
| `reviews.service.setApproval` / `remove` | Review write + product rating recompute |

**None of these can be safely implemented as separate, non-transactional Firestore writes.** Every one of them either enforces a uniqueness invariant, computes a running total, or fans out to multiple documents that must not be observed in a partially-applied state.

---

## 18. Cloudinary Upload Flow

`POST /uploads` (admin, `products.manage`) — Multer `memoryStorage()` (never touches disk) → MIME allowlist (jpeg/png/webp/avif) → 5 MB limit → `cloudinary.uploader.upload_stream({ folder: 'tsgecart/<query.folder>' })` → returns `{ url, publicId }`. Credentials (`CLOUDINARY_API_KEY`/`SECRET`) are server-only, read from `env.ts`, never sent to the client. **Retained as-is for the first migration phase** per the user's explicit instruction — the only Firebase-side change needed later is moving this one endpoint into a Callable/HTTPS Function with the same Multer-equivalent buffer handling.

---

## 19. Frontend API Abstraction, Protected Routes, SEO

- **API abstraction**: one Axios instance (`lib/apiClient.ts`) + one `*.api.ts` file per feature (13 files, listed in the audit's companion inventory) — each a thin, typed wrapper returning `response.data.data`. This is already the correct shape to swap for a Callable-Functions client (`httpsCallable(functions, 'orders-create')(payload)`) or a Firestore-listener-based hook, module by module, without touching component code — **this is the core enabler of an incremental migration.**
- **Protected routes**: `ProtectedRoute` (customer auth) and the same component with `roles={['ADMIN','STAFF']}` (admin tree) — both read only `AuthContext.user.role`/`isAuthenticated`, no direct token/claim inspection in components.
- **SEO**: dependency-free `Seo.tsx` (manages `<title>`/meta/OG/canonical/JSON-LD via `useEffect` + direct DOM manipulation) + a backend-generated `sitemap.xml` (`modules/seo`) built from live `Category`/`Product` rows. The sitemap generator will need a Firestore-query equivalent in Phase 4+ (out of scope now) — noted, not solved.

---

## 20. Existing Tests & Coverage

**Backend:** 5 Vitest files, 34 tests, all passing at the start of this session (verified). All are **pure-logic unit tests with no live database** — `auth.test.ts` (password hashing, JWT round-trip, token hashing), `pagination.test.ts` (pagination/sort-allowlist helpers), `delivery.test.ts` (delivery-charge computation), `pincodeImport.test.ts` (14 tests — the bulk-import planner), `rewardSpin.test.ts` (10 tests — probability validation, weighted selection, code generation). **This "pure planner function, unit-tested without a DB" pattern is exactly the shape Firebase Functions unit tests should take** (test the business logic directly; use the Emulator Suite only for integration/Rules tests).

**Frontend:** No test files currently exist (confirmed — `find frontend/src -name '*.test.*'` returns nothing). Verification currently relies on `tsc --noEmit`, ESLint, and production build success. Not a blocker for Phase 0/1, but worth flagging: **Firestore Rules tests (Phase 1 deliverable, see `firebase/functions/tests/`) will be the first automated tests covering data-access behavior in this project.**

---

## 21. Security Risks To Account For (pre-existing, independent of migration)

1. **In-memory rate limiting** (§1) — resets on restart, doesn't share state horizontally. Firebase Functions are inherently horizontally-scaled/stateless per-invocation, so this problem **must** be solved differently (Firestore-counter-based or App Check + Cloud Armor-equivalent) rather than carried forward as-is.
2. **Permission freshness vs. token lifetime** (§7) — current design re-reads permissions from MySQL every request. A naive Firebase-claims approach (claims baked into a 1-hour ID token) would let a revoked STAFF permission remain valid for up to an hour. Must be explicitly designed in Phase 2 (options: short ID-token lifetime + forced refresh on role change via `revokeRefreshTokens`, or a hybrid where sensitive admin routes double-check a Firestore `userRoles/{uid}` document server-side rather than trusting the token claim alone).
3. **Webhook raw-body handling** — must be replicated exactly in the Functions equivalent; a common Firebase migration bug is losing raw-body access because `onRequest` handlers sometimes get pre-parsed JSON depending on framework glue. Must be verified explicitly in Phase 3.
4. **Two spin-wheel systems** (§12) — a security/consistency risk in its own right (two independent cooldown/reward paths a user could interleave). Must be resolved (not necessarily in Phase 2) before or during the rewards-domain migration.

## 22. Firebase Migration Risks

1. **Firestore lacks native decimal/fixed-point numbers** — all money fields need integer-minor-unit or string-based representation + explicit rounding helpers (the codebase already centralizes rounding in small `round()` helpers per service, which is good — but they assume JS floating-point `Decimal`-adjacent inputs from Prisma; will need auditing when ported).
2. **Cross-document transactions in Firestore require all reads to happen before all writes**, and **cannot read a document twice**, and **cannot query inside a transaction in older SDKs** (fixed in more recent Admin SDK versions but requires explicit design) — the order-creation transaction (§13) reads cart+address+zone+coupon+wallet-balance, then writes order+items+history+payment+wallet+inventory×N+redemption+cart-clear. This is **8+ distinct writes**, several to documents whose IDs aren't known until earlier reads complete (e.g., you must read the cart before knowing which `productVariant` documents to decrement) — this is straightforward in Firestore but must be carefully sequenced (read-phase, then write-phase) and is the single highest-risk piece of business logic to port. Recommend a dedicated design spike before Phase 3 implementation, not attempted in this session.
3. **No native `SUM`/`GROUP BY`** — the admin analytics module (§15) currently uses several `prisma.aggregate`/`groupBy` calls. Firestore has no equivalent; options are (a) Cloud Functions that maintain denormalized counter/aggregate documents on every write (recommended, "aggregation document" pattern), or (b) BigQuery export + scheduled queries for historical analytics (heavier, defer to a later phase). Must be decided per-metric in Phase 6-equivalent (admin/analytics migration), not now.
4. **Composite-unique-constraint enforcement** (e.g., one review per user per product, one cart-item per variant) has no native Firestore equivalent — must be implemented via **deterministic document IDs** (e.g., `reviews/{userId}_{productId}`) so a duplicate write is a controlled overwrite/reject rather than a silent duplicate row. Documented per-collection in §23.
5. **bcrypt hashes are not portable to Firebase Auth's default hashing** unless the Firebase project is configured to use the **`hashAlgorithm: BCRYPT` import option**, which Firebase Auth *does* support for the `auth.importUsers()` bulk-import API — this is the key finding of §25 (password migration analysis) and materially changes the recommended approach.

## 23. Features Requiring Firestore Transactions
Order creation (§13), wallet balance adjustment (§15/§17), spin/reward-coupon issuance (§12, cooldown-check + coupon-create must be atomic to prevent double-spins from concurrent requests), default-address exclusivity, coupon-usage-limit enforcement (read `usedCount`, compare, increment — classic transaction pattern), inventory decrement/increment (must never go negative — requires a transaction that reads-then-conditionally-writes, not a blind `increment()`).

## 24. Features Requiring Callable Functions
Everything currently behind `authenticate` middleware where the caller is a known, signed-in app user calling from the React frontend: register/login-adjacent profile ops (post-Auth-migration, most of `/users`), cart/wishlist mutations, order creation, coupon apply, spin, review creation, notification read-state, admin CRUD (with claim checks inside the function). Callable Functions are preferred over HTTPS wherever the caller is always the first-party frontend, because the client SDK handles ID-token attachment, CORS, and error-code mapping automatically.

## 25. Features Requiring HTTPS Functions
Razorpay webhook (must accept raw, unauthenticated, third-party-signed POSTs — incompatible with the Callable envelope), the dynamic `sitemap.xml` (must be a plain URL for crawlers, no Firebase-SDK client), and the health check (`GET /health`, must be curl-able without any SDK — this is exactly what Phase 1 implements).

## 26. Features Suitable For Direct Firestore Reads (no Function required)
Public catalog browsing (categories, brands, active products, banners) once Security Rules open read access to those specific collections — this removes load from Cloud Functions entirely for the highest-traffic, lowest-sensitivity reads. A user's own profile/orders/notifications/wishlist/cart, once Rules enforce `resource.data.userId == request.auth.uid` **read-only** (writes still go through Functions for the collections listed in §27).

## 27. Features That Must Never Be Directly Writable By Customers
Orders and order items (server-computed totals, snapshotted pricing), payments (signature-verified only), inventory/stock (transactional, server-only), coupons and reward-coupon status (issuance and redemption are server events), wallet transactions (append-only ledger, server-only), product/category/brand/banner content (`*.manage` permission required), delivery zones/pincodes (`delivery.manage`), reviews' `isApproved` flag and `ratingAvg`/`ratingCount` (customers may create a review, but never set its approval or the product's aggregate), user roles/permissions/custom-claims (ADMIN-only, via a server-verified path — never a client Firestore write, regardless of Rules, because Rules alone cannot safely gate "can assign ADMIN to another user" without also re-verifying the caller's own current claim server-side, which Rules can do, but the *side effect* of setting a custom claim requires the Admin SDK, which only runs in a Function).

## 28. Recommended Rollout & Rollback Plan

**Rollout** (strictly incremental, each phase independently shippable and reversible):
- Phase 1 (this session): Firebase project scaffold + emulators only. Zero production impact — nothing is wired to the live frontend or backend.
- Phase 2 (next, pending approval): Firebase Auth stood up **in parallel** with the existing JWT system (dual-write or shadow-mode — new registrations optionally create both a MySQL user and a Firebase Auth user; existing users unaffected until explicitly migrated). No traffic cutover.
- Phase 3: Read-only catalog (categories/products/banners) mirrored into Firestore via a one-way, additive sync Function triggered off the existing MySQL writes (or a scheduled export) — frontend catalog pages can be A/B-switched to read from Firestore while all writes still go through the existing admin API. MySQL remains the source of truth.
- Phase 4+: Cart → Orders → Payments → Admin, each cut over only after the prior phase has run in production, side-by-side, with monitoring, for a defined soak period.
- **At every phase, the Express/Prisma/MySQL backend keeps running unmodified** and can serve 100% of traffic if a Firebase phase is rolled back.

**Rollback:** because every phase is additive and no phase deletes or mutates the existing backend/database, rollback is simply "stop routing traffic to the Firebase path" — no data migration needs to be reversed until a phase explicitly makes Firestore the source of truth for a given domain (not proposed to happen before Phase 4+, and even then behind a feature flag / environment toggle, not a hard cutover commit).

---

## 29. Migration Mapping Table

| Current component | Firebase replacement | Notes |
|---|---|---|
| MySQL `User` table + bcrypt | Firebase Authentication (email/password provider) + Firestore `userProfiles/{uid}` for app-specific fields | See §25 for password-hash portability |
| `RefreshToken` table + rotation logic | Firebase ID tokens (client-SDK managed) + `admin.auth().revokeRefreshTokens(uid)` for "log out everywhere" | Reuse-detection becomes unnecessary — Firebase's refresh tokens are opaque and rotated by Google's infrastructure |
| `VerificationToken` (email verify / reset) | Firebase Auth's native `sendEmailVerification` / `sendPasswordResetEmail`, or Admin SDK `generateEmailVerificationLink`/`generatePasswordResetLink` for custom-branded emails via existing SMTP | Table can be retired post-migration |
| bcrypt password storage | Firebase Authentication (Google-managed, scrypt-based) | Existing bcrypt hashes importable via `auth.importUsers({ hash: { algorithm: 'BCRYPT' } })` — see §25 |
| 36 Prisma models | Firestore collections/subcollections (proposed mapping in §30) | 1:1 for most; a few require denormalization (see notes per-collection) |
| Express REST routes (§2) | Firebase Callable Functions (first-party frontend calls) or HTTPS Functions (webhooks, sitemap, health) | See §24/§25 for the split |
| `Role`/`Permission`/`UserPermission` tables | Firebase custom claims (`role`, `permissions[]`) set via Admin SDK, mirrored to `userProfiles/{uid}.role` for query/display convenience only (claims remain the authority) | See §14, §21.2 for freshness caveat |
| Redis pincode cache | Firestore document with `expiresAt`, checked at read time — or removed in favor of Firestore's own latency (decision deferred to Phase 3) | Redis's only other use (health ping) is dropped entirely |
| Prisma `$transaction` blocks (§17) | `db.runTransaction()` (Firestore transactions) for read-modify-write invariants; `WriteBatch` for known-shape multi-doc writes with no cross-doc reads | Order creation (§13) needs the most careful port — flagged as a design spike |
| Razorpay order-creation + verify | Callable Function `payments-createRazorpayOrder` / `payments-verifyRazorpayPayment`, same HMAC logic, secrets via Firebase Functions Secret Manager | Logic is provider-agnostic to Firestore vs MySQL; mostly a lift-and-shift |
| Razorpay webhook route | HTTPS Function `payments-webhook`, raw body via `onRequest` + `express.raw` equivalent, same HMAC verification | Must preserve raw-body access exactly (§21.3) |
| Admin authorization | Firebase custom claims + Callable-Function-side `context.auth.token.role` check + Firestore Security Rules mirroring the same claim | Never email-based (per requirement); initial admin claim set via a one-time, documented `firebase/functions/scripts/` command — not committed code that runs automatically |
| Cloudinary uploads | Unchanged in Phase 1–3; later becomes a Callable/HTTPS Function wrapping the same `upload_stream` call, secrets via Functions Secret Manager | Explicitly retained per user instruction |
| Sitemap generator | HTTPS Function querying Firestore instead of Prisma, same output shape | Not attempted before catalog data lives in Firestore |
| Nginx reverse proxy | Firebase Hosting (rewrites to Functions/Callable, SPA fallback, `sitemap.xml`/`robots.txt` static-file rewrite) | Not configured yet — Phase 1 ships `firebase.json` hosting config as a placeholder only, not wired to a real site |

---

## 30. Firestore Data-Model Proposal (design only — no data migrated)

General conventions used throughout:
- **Timestamps**: every collection has `createdAt`/`updatedAt` as Firestore `Timestamp` (server-set via `FieldValue.serverTimestamp()`), never client-supplied.
- **Money**: stored as integer **minor units** (paise) in a field suffixed `Paise` (e.g., `priceInPaise: 20000` for ₹200.00), converted to display rupees only in the client — avoids all floating-point/decimal-portability issues from §22.1.
- **Soft delete**: collections that currently use `isActive: Boolean` in MySQL keep that exact field name and semantics; nothing is ever hard-deleted from a Firestore collection that has order/audit implications (products, coupons) — hard delete remains acceptable only for admin-managed reference data with no history dependency (banners, delivery zones with zero pincodes assigned).
- **Ownership**: every user-owned document stores `userId: string` (the Firebase `uid`) as a top-level field, always the field Security Rules key off — never inferred from document path alone, so Rules stay simple and consistent.

### `userProfiles/{uid}`
- **Doc ID**: Firebase Auth `uid` (deterministic, no separate ID needed).
- **Fields**: `name`, `email` (mirrored from Auth for query convenience), `phone`, `role` (`'CUSTOMER'|'STAFF'|'ADMIN'`, **display/query mirror only — claims are authoritative**), `emailVerified` (mirrored from Auth), `referralCode` (unique, generated at profile creation), `avatarUrl`, `isActive`, `createdAt`, `updatedAt`.
- **Relationships**: referenced by `userId` from orders, cart, wishlist, reviews, notifications, wallet, rewardCoupons, addresses.
- **Read**: owner or ADMIN/STAFF (`customers.manage`-equivalent claim).
- **Write**: owner may update `name`/`phone`/`avatarUrl` only (enforced via Rules field-diffing); `role` writable only by a Function using the Admin SDK (never a direct client write, even by the user themself).
- **Admin-only fields**: `role`, `isActive`.
- **Indexes**: none beyond default (doc-ID lookups only) unless customer search-by-email/name is needed — if so, a composite index on `(role, createdAt)` for the admin customer list.
- **Transactions**: role changes should be transactional with the corresponding custom-claim `setCustomUserClaims` call (both-or-neither) — implemented inside a single Function, not a Firestore-only transaction.

### `addresses/{addressId}`
- **Doc ID**: auto-generated.
- **Fields**: `userId`, `label`, `type`, `contactName`, `contactPhone`, `line1`, `line2`, `landmark`, `pincode`, `city`, `state`, `latitude`, `longitude`, `isDefault`, `createdAt`, `updatedAt`.
- **Read/Write**: owner only (Function-mediated for the default-address-exclusivity transaction; direct client writes acceptable for non-default fields if Rules can safely express "at most one `isDefault: true` per user" — likely still safer as a Function given the transaction requirement in §17).
- **Indexes**: composite `(userId, isDefault)` for "get my default address" queries; `(userId, createdAt desc)` for the address list.

### `categories/{categoryId}`
- **Doc ID**: slug (e.g., `fruits-vegetables`) — human-readable, avoids a separate slug-lookup query.
- **Fields**: `name`, `description`, `imageUrl`, `parentId` (nullable, self-reference by doc ID), `sortOrder`, `isActive`, `createdAt`, `updatedAt`.
- **Denormalized**: `productCount` (maintained by a Function trigger on product write, avoiding a full collection count query per page load).
- **Read**: public (active only, via Rules `resource.data.isActive == true` for unauthenticated/customer reads; STAFF/ADMIN see all).
- **Write**: `products.manage` claim only.
- **Indexes**: `(parentId, isActive, sortOrder)` for building the category tree.

### `brands/{brandId}`
Same shape/permissions as categories, no `parentId`.

### `products/{productId}`
- **Doc ID**: slug.
- **Fields**: `name`, `description`, `categoryId`, `brandId`, `images` (array of Cloudinary URLs — bounded, max ~10, acceptable per the "avoid unbounded arrays" rule since it's a small, admin-controlled list), `gstRatePercent`, `hsnCode`, `isActive`, `isFeatured`, `isBestSeller`, `ratingAvg`, `ratingCount`, `metaTitle`, `metaDescription`, `createdAt`, `updatedAt`.
- **Explicitly NOT embedded**: variants (own collection, §below) — a product can have several variants and each has independent inventory that changes far more often than product metadata; embedding would force a full-product rewrite on every stock change, which is exactly the "unbounded/high-churn array" anti-pattern the instructions warn against.
- **Read**: public (active only).
- **Write**: `products.manage` claim only. `ratingAvg`/`ratingCount` writable only by the review-approval Function, never by any client.
- **Indexes**: `(categoryId, isActive, createdAt)`, `(isFeatured, isActive)`, `(isBestSeller, isActive)`, `(brandId, isActive)` — mirrors the current Prisma `@@index` set exactly.

### `productVariants/{variantId}`
- **Doc ID**: SKU (unique by business rule already — reuse as the doc ID for a free uniqueness guarantee).
- **Fields**: `productId`, `unitLabel`, `mrpPaise`, `pricePaise`, `weightGrams`, `isActive`, `isDefault`, `createdAt`, `updatedAt`.
- **Read**: public (active only, joined client-side to its parent product by `productId`).
- **Write**: `products.manage` claim only.
- **Indexes**: `(productId, isActive)`.

### `inventory/{variantId}`
- **Doc ID**: same as the owning variant's doc ID (1:1, deterministic — no separate lookup needed).
- **Fields**: `stock`, `reserved`, `lowStockThreshold`, `isLowStock` (denormalized boolean, recomputed on every write — resolves the cross-field-comparison query gap flagged in §22.3), `updatedAt`.
- **Read**: public (only `stock > reserved`-derived availability shown; STAFF/ADMIN see raw numbers) — recommend exposing a computed `availableStock` field rather than raw `stock`/`reserved` to avoid leaking exact reserved-count to competitors scraping the site.
- **Write**: **never directly writable by any client, including admins' browsers** — always via a Function (`inventory.manage` claim for manual adjustment, order-creation Function for decrements, cancel Function for increments) because every write is either transactional (order flow) or needs the `isLowStock` recompute.
- **Transactions**: every write is transactional (read-current, validate non-negative, write-next).

### `carts/{userId}` (doc ID = uid, 1:1)
- **Fields**: `updatedAt` only at the parent level — line items are a subcollection `carts/{userId}/items/{variantId}` (doc ID = variant ID, so "add to cart" is a deterministic upsert, not a query-then-create).
- **Item fields**: `quantity`, `addedAt`. **Deliberately no price/name snapshot** — cart totals are always computed live server-side from current `productVariants`/`inventory`, matching current behavior exactly (§9) and preventing stale/manipulated prices.
- **Read/Write**: owner only for `quantity` changes (direct client writes acceptable here since cart mutation has no cross-user invariant — unlike orders); **cart total computation remains a Callable Function** (`cart-getSummary`), never trusted from client-side arithmetic.

### `wishlists/{userId}/items/{productId}` (doc ID = uid / productId)
- **Fields**: `addedAt`.
- **Read/Write**: owner only, direct client writes acceptable (no server-side computation needed, unlike cart).

### `deliveryZones/{zoneId}`
- **Fields**: `name`, `description`, `deliveryChargePaise`, `freeDeliveryLimitPaise`, `minEtaMinutes`, `maxEtaMinutes`, `isActive`, `createdAt`, `updatedAt`.
- **Read**: public (needed for the pre-checkout serviceability display).
- **Write**: `delivery.manage` claim only.

### `serviceablePincodes/{pincode}` (doc ID = the 6-digit pincode itself — deterministic, doubles as the uniqueness constraint)
- **Fields**: `zoneId`, `city`, `state`, `isServiceable`, `createdAt`, `updatedAt`.
- **Read**: public (this is the direct-read replacement for the Redis-cached `GET /delivery/check/:pincode` — a Firestore doc-ID read by pincode is already fast enough that the Redis layer is likely droppable, per §4/§22 note — confirm with production latency testing in Phase 3, not decided here).
- **Write**: `delivery.manage` claim only; bulk-import remains a Callable Function (reuses the exact pure-planner pattern from `pincodeImport.ts`, §8).
- **Indexes**: `(zoneId, isServiceable)` for the admin zone-detail view.

### `localities/{localityId}`
- **Fields**: `name`, `pincodeId` (references the pincode doc ID), `zoneId`, `isActive`.
- **Read**: public. **Write**: `delivery.manage`.

### `coupons/{code}` (doc ID = the uppercased coupon code — deterministic uniqueness)
- **Fields**: `description`, `type` (`PERCENTAGE'|'FLAT'`), `valuePaiseOrPercent`, `minOrderPaise`, `maxDiscountPaise`, `usageLimit`, `perUserLimit`, `usedCount`, `startsAt`, `expiresAt`, `isActive`, `createdAt`, `updatedAt`.
- **Read**: **not publicly listable** (no "browse all coupons" collection read) — a customer can only resolve a *specific known code* via a Callable Function (`coupons-apply`) that validates and returns the discount; this exactly matches current behavior (coupons aren't listed anywhere in the current UI either) and closes off code-enumeration.
- **Write**: `coupons.manage` claim only, except `usedCount` which is incremented only by the order-creation Function.

### `couponUsages/{couponCode}_{userId}` (doc ID = deterministic composite — directly enforces the current `(couponId, userId count vs perUserLimit)` check as a doc-existence/count query)
- **Fields**: `userId`, `couponCode`, `orderId`, `redeemedAt`. For `perUserLimit > 1` coupons, this becomes `couponUsages/{couponCode}_{userId}/redemptions/{orderId}` (subcollection) instead of a single doc — noted as a refinement needed once a specific `perUserLimit > 1` coupon is configured; not a blocker since the current seeded coupon uses `perUserLimit: 1`.
- **Write**: order-creation Function only.

### `rewardConfigs/{configId}`
- **Fields**: `cashbackAmountPaise`, `probability` (int, active configs must sum to 100 — enforced in the Function, not in Rules, since Rules can't easily sum across documents), `minOrderPaise`, `expiryDays`, `isActive`, `sortOrder`, `createdAt`, `updatedAt`.
- **Read**: STAFF/ADMIN only for the full list with probabilities (customers should not see the odds); a filtered public shape (`cashbackAmountPaise`, `minOrderPaise` only, no `probability`) can be exposed via a Callable Function response, matching the current `GET /rewards-spin/wheel` shape exactly.
- **Write**: `rewards.manage` claim only.

### `rewardCoupons/{code}` (doc ID = the generated code — deterministic uniqueness, same pattern as `coupons`)
- **Fields**: `userId` (owner — enforced in Rules for read), `cashbackAmountPaise`, `minOrderPaise`, `status` (`'ACTIVE'|'REDEEMED'|'EXPIRED'`), `expiresAt`, `redeemedOrderId`, `redeemedAt`, `createdAt`.
- **Read**: owner only (`resource.data.userId == request.auth.uid`) or STAFF/ADMIN.
- **Write**: never directly by any client — issuance via the `rewardSpin-spin` Function (which also enforces the 24h-cooldown transaction), redemption via the order-creation Function.
- **Indexes**: `(userId, status)`, `(userId, createdAt desc)` for "my rewards" list; `(status, expiresAt)` for a scheduled Function that expires stale ACTIVE coupons (replacing the current lazy `updateMany` expiry-on-read with a proper Cloud Scheduler job — an improvement opportunity noted, not required).

### `spinHistory/{historyId}` (legacy system, §12 — included for completeness pending the Phase-2 reconciliation decision)
Mirrors `rewardCoupons` shape minus the coupon-code (legacy system credits wallet directly instead).

### `orders/{orderId}` (doc ID = the human-readable order number, e.g. `TSG-260718-00001234` — already globally unique by construction, no separate auto-ID needed)
- **Fields**: `userId`, `status`, `paymentStatus`, `subtotalPaise`, `discountPaise`, `taxTotalPaise`, `deliveryChargePaise`, `walletUsedPaise`, `totalPaise`, `couponCode` / `rewardCouponCode` (nullable), `deliveryZoneId`, `etaMinMinutes`, `etaMaxMinutes`, shipping-address snapshot fields (`shipContactName`, `shipLine1`, …, exactly mirroring the current `Order` model's inline snapshot — **not** a reference to the `addresses` collection, so historical orders remain correct even if the address is later edited/deleted), `placedAt`, `deliveredAt`, `cancelledAt`, `createdAt`, `updatedAt`.
- **Explicitly NOT embedded**: order items (subcollection `orders/{orderId}/items/{itemId}`) and status history (subcollection `orders/{orderId}/statusHistory/{historyId}`) — this is the direct application of the "do not put entire order histories inside a user document" rule: each order's items/history live *under the order*, not under the user, and the user's "my orders" view queries `orders` where `userId == uid`, never reads a user document's array.
- **Read**: owner or STAFF/ADMIN (`orders.manage`).
- **Write**: **never directly by any client.** All order lifecycle writes go through Functions: `orders-create` (initial), `orders-updateStatus` (admin), `orders-cancel` (owner-initiated, Function-mediated for the restock transaction), `payments-webhook`/`payments-verify` (payment-status updates).
- **Indexes**: `(userId, placedAt desc)` for order history, `(status, placedAt desc)` for admin filtering, `(paymentStatus, placedAt desc)`.

### `orders/{orderId}/items/{itemId}` (subcollection)
Snapshotted fields exactly matching current `OrderItem` (`productName`, `variantLabel`, `sku`, `imageUrl`, `unitPricePaise`, `gstRatePercent`, `quantity`, `lineTotalPaise`). Read: inherits parent order's Rules (owner/admin). Write: order-creation Function only.

### `orders/{orderId}/statusHistory/{historyId}` (subcollection)
`status`, `note`, `createdAt`. Write: `orders-updateStatus` Function / `orders-create` (initial CONFIRMED entry) / `orders-cancel` only.

### `paymentRecords/{orderId}` (doc ID = order ID, 1:1)
- **Fields**: `method`, `status`, `amountPaise`, `currency`, `razorpayOrderId`, `razorpayPaymentId`, `razorpaySignature` (stored for audit only, never re-exposed to any client read), `refundId`, `refundedAmountPaise`, `paidAt`, `createdAt`, `updatedAt`.
- **Read**: owner (limited fields — status/method/amount only, via a Function-shaped response, not a direct Rules-gated field-level read, since Firestore Rules can't easily do field-level redaction) or STAFF/ADMIN (full).
- **Write**: never directly by any client — `orders-create`, `payments-verify`, `payments-webhook`, `orders-refund` Functions only.
- **Separate collection from `orders`** (rather than a subcollection) specifically so Security Rules can apply stricter read redaction to payment internals than to general order status, without duplicating logic across many order-subresource paths.

### `reviews/{userId}_{productId}` (doc ID = deterministic composite — directly replaces the current `@@unique([userId, productId])` constraint)
- **Fields**: `userId`, `productId`, `orderId` (the delivered order that authorized this review), `rating`, `title`, `comment`, `isApproved`, `createdAt`, `updatedAt`.
- **Read**: public (`isApproved == true` only) or owner (their own, any approval state) or STAFF/ADMIN (all).
- **Write**: creation by the owner **only via a Function** that re-verifies the delivered-order purchase check server-side (this specific check — "does this user have a DELIVERED order containing this product" — requires a query across the `orders`/`orders/*/items` collections that Firestore Rules cannot perform, so it cannot be a direct client write even with Rules); `isApproved` and the parent product's `ratingAvg`/`ratingCount` recompute are Function-only (`reviews.manage`).
- **Indexes**: `(productId, isApproved, createdAt desc)` for the product-detail review list; `(userId, createdAt desc)` for "my reviews".

### `banners/{bannerId}`
- **Fields**: `title`, `imageUrl`, `linkUrl`, `position`, `sortOrder`, `isActive`, `startsAt`, `endsAt`, `createdAt`, `updatedAt`.
- **Read**: public (Rules can express the `isActive && startsAt <= now <= endsAt` window directly, since it only depends on the document's own fields and `request.time`).
- **Write**: `banners.manage` claim only.

### `notifications/{userId}/items/{notificationId}` (subcollection under the user)
- **Fields**: `type`, `title`, `body`, `link`, `isRead`, `createdAt`.
- **Read/Write(isRead only)**: owner. **Creation**: Function-only (triggered from order/status/referral Functions), never direct client writes for new notifications.
- **Indexes**: `(isRead, createdAt desc)` within the subcollection (composite, per-user, automatically scoped).

### `walletTransactions/{userId}/ledger/{transactionId}` (subcollection under the user — append-only)
- **Fields**: `source` (`'SPIN'|'REFERRAL'|'REFUND'|'ADMIN_ADJUSTMENT'|'ORDER_REDEMPTION'`), `amountPaise` (signed), `balanceAfterPaise`, `reference`, `note`, `createdAt`.
- **Read**: owner or ADMIN. **Write**: never directly by any client — every entry is a side effect of a Function (`orders-create` for redemption, `rewardSpin-spin` for legacy-system credits, `referral-complete`, `orders-refund`).
- **Transactions**: every write reads the latest ledger entry (`orderBy('createdAt','desc').limit(1)`) inside the same `runTransaction()` that writes the new entry, to compute `balanceAfterPaise` — directly ports the current `walletService.adjust()` logic.

### `referrals/{refereeId}` (doc ID = the new user's uid — enforces "one referral per new user" for free, same as the current `@@unique(refereeId)`)
- **Fields**: `referrerId`, `code`, `status`, `rewardAmountPaise`, `completedAt`, `createdAt`.
- **Read**: either party or ADMIN. **Write**: creation at registration time (Function), completion at delivery time (Function, part of `orders-updateStatus`).

### `platformSettings/{key}` (doc ID = the setting key, e.g. `store.name`)
- **Fields**: `value` (any JSON-serializable type), `updatedAt`.
- **Read**: public for a documented allowlist of display settings (store name/tagline/support contact); ADMIN-only for the rest. **Write**: `settings.manage` claim only.

### `auditLogs/{logId}` (new — did not exist in the MySQL schema; proposed to support the "recommended rollout" transparency requirement and general production hygiene)
- **Fields**: `actorUid`, `action`, `targetCollection`, `targetId`, `beforeSnapshot` (optional, for destructive/role-change actions only — not logged for every write, to avoid unbounded growth), `afterSnapshot`, `createdAt`.
- **Read**: ADMIN only. **Write**: Function-only, written as a side effect of sensitive admin actions (role assignment, refunds, manual inventory adjustment, coupon/reward-config changes) — not a general-purpose audit of every Firestore write, which would be prohibitively expensive; scope is deliberately limited to the highest-risk mutation paths.
- **Indexes**: `(actorUid, createdAt desc)`, `(targetCollection, targetId, createdAt desc)`.

**Explicitly avoided, per the instructions:** no `orderIds: string[]` array on `userProfiles` (orders are queried by `userId`, not embedded); no `items: [...]` array inside `products` (variants are a separate collection); no `pincodes: [...]` array inside `deliveryZones` (pincodes reference their zone, not the reverse); no client-writable `totalPaise` field on any order-adjacent document.

---

## 31. Firebase Auth Migration Design (design only — not implemented this session)

**Core flows, mapped 1:1 to the current behavior in §5–§7:**

- **Registration**: Callable Function `auth-register` (not the client SDK's `createUserWithEmailAndPassword` directly) — because registration must *also* atomically create the `userProfiles/{uid}` document, generate a unique `referralCode`, and link a pending `referrals/{uid}` document if a referral code was supplied, exactly mirroring the current `createUserWithProfile` transaction (§17). The Function calls `admin.auth().createUser()` then writes Firestore in a transaction, rolling back the Auth user if the Firestore write fails (compensating-transaction pattern, since Auth-user-creation and Firestore-writes can't share one atomic transaction).
- **Login**: handled entirely client-side by the Firebase client SDK (`signInWithEmailAndPassword`) — no backend Function needed; this is a simplification versus the current custom JWT-issuance code.
- **Email verification**: client SDK `sendEmailVerification()` on the newly-created user (using Firebase's default action-handler page initially; a custom-domain action handler + branded template is a Phase 2+ refinement, not required for functional parity).
- **Forgot/reset password**: client SDK `sendPasswordResetEmail()`. Same no-enumeration property as today (Firebase's API doesn't reveal whether an email exists either).
- **Session persistence**: Firebase client SDK's own `browserLocalPersistence`/`inMemoryPersistence` — a deliberate decision point for Phase 2 (the current app intentionally avoids localStorage for the access token; recommend `browserSessionPersistence` or in-memory + silent re-auth to preserve that security posture, not the SDK default of `browserLocalPersistence`).
- **Custom claims for CUSTOMER/STAFF/ADMIN**: set via `admin.auth().setCustomUserClaims(uid, { role, permissions })`, callable only from a Function that itself requires the caller to already hold the ADMIN claim (`requireRole('ADMIN')`-equivalent check inside the Function, mirroring §7 exactly) — **never settable by the user themself, and never inferred from email.**
- **Server-side claim verification**: every Callable/HTTPS Function that needs authorization checks `context.auth.token.role`/`.permissions` (populated automatically by the Admin SDK from the custom claims on the caller's ID token) — direct equivalent of the current `authenticate` + `requirePermission` middleware chain.
- **Token refresh after role update**: custom claims only take effect on a **new** ID token. After an admin changes a user's role, the Function must call `admin.auth().revokeRefreshTokens(uid)` (forces the client SDK to mint a fresh ID token with updated claims on its next request) — this is the direct Firebase-native equivalent of the current "permissions re-read from DB every request" freshness guarantee (§7/§21.2), and should be treated as a **required** part of any role-change Function, not optional.
- **Admin route protection**: unchanged conceptually — the frontend's `ProtectedRoute roles={[...]}` continues to work as-is once `AuthContext` is sourced from Firebase's `onIdTokenChanged` listener instead of the current cookie-refresh effect; `user.role` is read from the decoded ID token's custom claims (via `getIdTokenResult()`), not from a Firestore document (Firestore mirror is for display/query only, per §30).
- **Firestore Rules role checks**: `request.auth.token.role == 'ADMIN'` / `'STAFF' in ...` — direct Rules-native equivalent of `requireRole`/`requirePermission`, usable without any Function round-trip for read-path authorization.
- **Initial-admin setup procedure**: a **one-time, manually-run, documented CLI script** (`firebase/functions/scripts/` — not deployed, not triggered automatically, not part of any HTTP-reachable Function) that takes an email as a command-line argument and calls `setCustomUserClaims`. This satisfies the "existing admin email may be used only by a one-time secure setup script or documented manual claim-assignment command" requirement exactly — **no email string appears in any deployed Function or Rules file.** Documented, not implemented, in Phase 1 (script itself is a Phase 2 deliverable since it depends on Firebase Auth being wired up).

---

## 32. Existing User Password Migration Analysis (research only — not executed)

**The finding that determines the recommendation:** Firebase Auth's `admin.auth().importUsers()` API supports a `hash.algorithm: 'BCRYPT'` import mode. This is a **direct, first-party-supported bulk-import path for bcrypt hashes** — Firebase Auth will store the imported bcrypt hash as-is and verify future login attempts against it using bcrypt, with **no forced password reset required**. This is materially better than the two options the task description anticipated, so it's presented as **Option C** below alongside the requested A/B.

### Option A — Direct bcrypt hash import (recommended)
- **Compatibility requirements**: `passwordHash` values in the current `User` table must be standard bcrypt (`$2a$`/`$2b$` prefix, which `bcryptjs` produces — confirmed by inspecting `shared/password.ts`, `bcrypt.hash(plain, env.BCRYPT_ROUNDS)` with `BCRYPT_ROUNDS=12`, a supported cost factor). Firebase's `importUsers` bcrypt mode requires **no salt separator or key configuration** (unlike its SCRYPT mode) — bcrypt hashes are self-contained (salt embedded in the hash string), which is the best-case scenario for import.
- **Risks**: (1) the import is a one-way, one-time bulk operation — any user who resets their password *during* the migration window between "export" and "import" would have their reset lost if not sequenced carefully (mitigate by a brief read-only maintenance window on the auth system specifically, not the whole site). (2) Firebase's bcrypt-verify path has historically been slightly slower than native bcrypt libraries for very high cost factors — cost 12 (current setting) is well within normal bounds and not a concern. (3) requires exporting `passwordHash` + `email` + `phone` + `emailVerified` from MySQL into Firebase's specific import JSON/CSV shape — a data-handling step that must never be logged or committed (hashes are still sensitive even though they're not plaintext).
- **User impact**: **zero** — existing users log in with their current password, unaware a migration happened.
- **Rollback**: trivial — Firebase-imported users are additive; the MySQL `User` table and Express JWT login path are untouched and remain fully functional as a fallback for as long as both systems run in parallel (per the phased rollout in §28).
- **Recommended for this project**: **yes** — given zero user impact and full rollback safety, and that the project's bcrypt configuration is squarely within Firebase's supported import parameters.

### Option B — Create Firebase users, require password reset
- **Compatibility requirements**: none (any password state works, since passwords aren't imported at all).
- **Risks**: guaranteed to lock out every existing customer until they complete a reset flow — a significant, avoidable support/trust cost for a store with **real, already-onboarded customers** (per the user's explicit data-protection instructions this session).
- **User impact**: high — every customer forced through "forgot password" on their next visit.
- **Rollback**: simple (same additive/parallel-system safety as Option A), but the *forward* impact is worse, not the rollback.
- **Recommended for this project**: **no**, unless Option A's compatibility check fails during a Phase 2 dry-run (fallback only).

### Option C — Hybrid (documented for completeness, not the primary recommendation)
Import via Option A for the bulk, but treat it as reversible per-user: if a specific account later has a login failure attributable to a hash-format edge case, fall back to a targeted Option-B reset for that account only, without affecting anyone else. This is really "Option A with a documented exception path," not a separate migration strategy — included so the decision isn't presented as falsely binary.

**Final recommendation:** Option A (direct bcrypt import), with a Phase-2 dry-run against a **copy** of the user table (never the live table) to confirm hash-format compatibility across the full existing user base before any real import runs, and the parallel-system rollout from §28 as the safety net regardless.

---

## 33. Summary Table — Audit Coverage Checklist

All 40 requested audit areas, confirmed covered above:

| # | Area | Section |
|---|---|---|
| 1 | Monorepo structure | §1 |
| 2 | Frontend architecture | §1, §19 |
| 3 | Backend architecture | §1 |
| 4 | Environment variables | §1 (backend/.env.example, frontend/.env.example inventoried) |
| 5–7 | Routes/Controllers/Services | §2, §1 |
| 8 | Repositories | §1 |
| 9–11 | Prisma models/relations/indexes | §3 |
| 12 | Redis usage | §4 |
| 13 | Auth & refresh-token flows | §5 |
| 14 | Email verification & reset | §6 |
| 15 | RBAC & permissions | §7 |
| 16 | Product & inventory flows | §8 |
| 17 | Cart & wishlist flows | §9 |
| 18 | Delivery & pincode validation | §10 |
| 19 | Coupon logic | §11 |
| 20 | Spin reward logic | §12 |
| 21 | Order creation | §13 |
| 22 | COD flow | §14 |
| 23 | Razorpay order creation | §14 |
| 24 | Payment signature verification | §14 |
| 25 | Razorpay webhook handling | §14 |
| 26 | Refund logic | §14 |
| 27 | Admin APIs | §15 |
| 28 | Analytics calculations | §15 |
| 29 | Notifications | §15 |
| 30 | Wallet and referrals | §15 |
| 31 | Scheduled jobs | §16 |
| 32 | Cooldowns | §16 |
| 33 | Cache invalidation | §16 |
| 34 | Transactions/atomic operations | §17 |
| 35 | Cloudinary upload flows | §18 |
| 36 | Frontend API abstraction | §19 |
| 37 | Protected routes | §19 |
| 38 | Admin route protection | §19 |
| 39 | SEO and routing | §19 |
| 40 | Existing tests and coverage | §20 |

## 34. Implementation Log — Phase 3 (products/categories, actually built)

This section records where the actual Phase 3 implementation deviated from
the §30 design proposal above, and why. §30 remains the long-term target;
this is the honest record of what Phase 3 shipped against it.

- **`productVariants` was not migrated to its own collection.** §30
  documents variants as a separate collection specifically so a stock
  change doesn't force a full-product rewrite. Phase 3 is scoped to
  browsing only (product/category listing + detail) — cart/orders
  integration, which is what actually needs multi-variant selection and
  live per-variant inventory, is explicitly out of scope for this phase.
  Building a variants collection nothing would yet read from would be
  speculative. Instead, `products/{slug}` carries a denormalized
  `defaultVariant` snapshot (`sku`, `unitLabel`, `mrpPaise`, `pricePaise`,
  `stock`) plus `minPricePaise`/`maxPricePaise` for sorting/filtering. A
  product page sourced from Firestore therefore shows one variant/price,
  not the full variant selector the existing Express-backed page shows.
  Real remaining work: `productVariants` collection + Function(s), done
  alongside the Cart/Orders migration phase, not before.
- **No `isTrending` field was added.** Confirmed by code search: "trending"
  has never been a real field in the Prisma schema or the Express API — it
  is a purely client-side fallback selection in `HomePage.tsx`
  (bestSeller → featured → newest). `getTrendingProducts()` replicates that
  exact fallback server-side, as one reusable Callable Function, rather
  than inventing a new field.
- **`sort=price` now does a real price sort.** The existing Express API's
  `sort=price` silently falls back to `createdAt` (see
  `backend/src/modules/products/products.service.ts`) because MySQL/Prisma
  has no per-product price without a variant join. Firestore's
  `minPricePaise` snapshot makes a genuine price sort straightforward — a
  deliberate, noted improvement, not an accidental behavior change (the
  Express API and its behavior are untouched).
- **Search is a best-effort `name` prefix match**, not the Express API's
  substring `contains` on name/description — Firestore has no native
  full-text search. When a search term is supplied, results are ordered by
  `name` regardless of the requested sort (a documented limitation).

## 35. Implementation Log — Phase 4 (variants, inventory, cart, wishlist, addresses)

Where Phase 4 deviated from §30/§9/§17/§27 above, and why.

- **`productVariants` is real now** — public read (active only), STAFF/
  ADMIN (`products.manage`) write, exactly mirroring `products`/
  `categories`. No `gstRatePercent` on the variant doc: GST is a
  per-PRODUCT rate in the source schema (Prisma `Product.gstRate` — there
  is no such column on `ProductVariant`), so cart line totals join to the
  parent product for it rather than duplicating a rate that could never
  legitimately differ between a product's own variants.
- **`inventory` is real now, exactly as §30 specified**: never directly
  writable by any client, including an admin's browser — always via a
  Function, inside a Firestore transaction. STAFF/ADMIN with
  `inventory.manage` may read raw `stock`/`reserved`; everyone else only
  ever sees the denormalized `availableStock` already published on the
  public `productVariants` doc (recomputed by the same transaction that
  adjusts `inventory`).
- **Real stock reservation on add-to-cart — new behavior, not a parity
  port.** The existing Express `Inventory.reserved` column is defined in
  the Prisma schema but is never written anywhere in the current codebase
  (confirmed by a full-repo grep) — today's cart-time stock checks are
  read-only/advisory, and the only real stock mutation happens at order-
  creation time. Phase 4's instructions explicitly asked for real
  reservation ("prevent adding more than available stock," "reserved stock
  changes" under transactions), so `addCartItem`/`updateCartItemQuantity`/
  `removeCartItem`/`clearCart` now actually increment/decrement
  `inventory.reserved` inside a Firestore transaction alongside the cart
  item write. This is a deliberate improvement, done because it was asked
  for — not an accidental behavior change to the untouched Express cart.
- **Cart mutations are Function-only, departing from §30's own suggestion**
  ("direct client writes acceptable here since cart mutation has no
  cross-user invariant"). That was true before reservation existed; once
  adding to cart also has to atomically reserve stock, a direct client
  write cannot be trusted to execute that transaction honestly (§27: never
  trust client-computed prices/totals; a compromised or buggy client could
  write a cart item without ever touching `inventory`, or reserve without
  writing the item). `carts/{uid}` and its `items` subcollection are read:
  owner-only, write: Function-only.
- **Addresses are also Function-only for writes** — reads are still
  direct-client (owner-only Rule, no cross-document invariant to protect
  on a read), but §30 itself flagged this as unresolved ("likely still
  safer as a Function given the transaction requirement"); the
  default-address-exclusivity invariant (at most one `isDefault: true` per
  user) is exactly the kind of cross-document invariant Rules cannot
  safely enforce against a client racing two writes, so it resolved to
  Function-only, matching the existing Express `users.repository.ts`
  behavior (`prisma.$transaction` around "unset all other defaults, then
  write"). Deleting a user's default address promotes the next one via a
  **second, separate transaction** (not atomic with the delete) —
  deliberately matching the existing Express behavior's own gap
  (`users.service.ts`'s `deleteAddress` does the same two-step), not
  inventing a stronger guarantee the original app doesn't have either.
- **Wishlist needed no deviation** — direct client read/write, owner-only,
  exactly as §30 proposed. No authoritative computation involved, and
  duplicate-prevention is structural (the item doc ID is the product's own
  slug), so there's nothing a Function would add.
- **No guest-cart merge was implemented.** The migration instructions
  asked for this "if the current app supports guest carts" — a repo-wide
  search (backend and frontend) for any guest/session/device-based cart
  concept returned nothing: the entire existing cart module is
  `authenticate`-gated, with no pre-login cart to merge from. The
  conditional in the instructions resolves to "not applicable," not a gap.
- **Two separate auth systems, one page each.** `/cart`, `/wishlist`, and
  `/account` were moved out of the JWT-only `ProtectedRoute` (they now sit
  alongside the public routes in `app/router.tsx`) because a Firebase-only-
  authenticated visitor has no JWT session and would otherwise be redirected
  to `/login` before ever reaching that page's own Firebase-aware logic —
  exactly the failure mode caught during manual verification. Each page now
  enforces whichever auth system is relevant itself (mirroring how `/cart`
  already worked before this phase). An already-JWT-authenticated user sees
  no behavior change; a signed-into-neither visitor now sees an in-page
  "sign in" prompt instead of a hard redirect — same destination, arguably
  friendlier, and consistent across all three pages.
