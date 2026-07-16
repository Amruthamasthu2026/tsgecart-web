# TSG eCart — Architecture

## Overview

TSG eCart is a decoupled quick-commerce grocery platform serving Hyderabad. It
comprises three deployable units — a React 19 SPA, an Express REST API, and a
MySQL database — with Redis for caching/rate-limiting, all fronted by Nginx and
containerized with Docker.

```
Browser ──► Nginx ──► Express API ──► MySQL (Prisma)
                           │
                           ├──► Redis (cache, rate limit, tokens)
                           └──► Razorpay · Cloudinary · SMTP
```

## Backend layering (Clean Architecture)

Each feature lives in `src/modules/<feature>/` and follows a strict layering:

```
Route → Middleware (auth, validate, rateLimit) → Controller → Service → Repository → Prisma
```

- **Controllers** handle HTTP only: parse input, call a service, shape the response.
- **Services** hold business rules and orchestrate transactions. No Express types.
- **Repositories** are the only layer that touches Prisma — keeps logic testable.
- **Validators** are Zod schemas used by the `validate` middleware.

Cross-cutting concerns live in `src/shared` (errors, response envelope, async
handler, pagination) and `src/config` (env, logger, prisma, redis).

## Response contract

All responses use a consistent envelope:

```jsonc
// success
{ "success": true, "data": { ... }, "meta": { "page": 1, "limit": 20, "total": 55 } }
// error
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "...", "details": { ... } } }
```

## Authentication

- Short-lived **access token** (JWT, 15 min) sent in the `Authorization` header.
- Rotating **refresh token** stored as an httpOnly, secure cookie; hashed at rest
  in the `RefreshToken` table and revocable.
- Passwords hashed with bcrypt. Email verification and password reset use hashed,
  expiring tokens in `VerificationToken`.
- **RBAC** via `Role` enum plus granular `Permission` records for staff/admin.

## Security

Helmet, CORS allowlist, layered rate limiting (global/auth/payment), Zod input
validation on every route, Prisma-parameterized queries (SQL-injection safe),
Razorpay webhook signature verification, secrets kept server-side only.

## Data integrity decisions

- **Order & payment snapshotting** — `OrderItem` stores product name/price/SKU and
  `Order` stores the shipping address inline, so historical records survive
  catalog and address edits.
- **Product variants** — groceries sell by unit (500 g, 1 L, 6 pcs); stock and
  pricing live at the `ProductVariant` level with per-variant `Inventory`.
- **Per-product GST** — `Product.gstRate` + `hsnCode`; tax is computed and
  snapshotted per order line.

## Delivery configuration (no code changes)

`DeliveryZone`, `Pincode`, and `Locality` are admin-managed. Serviceability,
delivery charge, free-delivery limit, and ETA all resolve from these tables at
checkout, so operations can expand coverage without a deploy.
