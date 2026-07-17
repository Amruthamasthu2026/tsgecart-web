# TSG eCart — Development Roadmap

Each phase ships fully-implemented, tested slices — no placeholders — building
strictly on the prior phase.

| Phase | Scope | Status |
|-------|-------|--------|
| **0 — Foundation** | Monorepo, Docker, Nginx, Prisma schema + seed, config, logging, error handling, CI, SPA shell | ✅ Done |
| **1 — Auth & Users** | Register/login, JWT + rotating refresh tokens, email verify, forgot/reset, RBAC, addresses, profile | ✅ Done |
| **2 — Catalog** | Categories, brands, products, variants, Cloudinary uploads, search/filter/sort, product detail, admin CRUD | ✅ Done |
| **3 — Cart & Delivery** | Cart, wishlist, coupons, delivery zone/pincode validation + ETA/charges, admin delivery management | ✅ Done |
| **4 — Orders & Payments** | Order creation (COD + Razorpay), payment verify + webhook + refund, invoice, status timeline, admin orders | ✅ Done |
| **5 — Engagement** | Reviews/ratings, referral, spin wheel, wallet, notifications, banners, recently viewed, recommendations | ⬜ Pending |
| **6 — Admin & Analytics** | Dashboard, revenue/sales analytics, inventory, roles & permissions, settings | ⬜ Pending |
| **7 — Hardening & SEO** | SEO (slugs, meta, schema.org, sitemap, robots), performance, QA, security pass, prod deploy | ⬜ Pending |

## Phase 0 deliverables (complete)

- Two-package npm-workspace monorepo (`backend`, `frontend`).
- `docker-compose.yml` provisioning MySQL 8 + Redis 7 with healthchecks.
- Nginx reverse-proxy config (SPA + `/api` proxy, gzip, security headers, caching).
- Complete Prisma schema (28 models) with indexes, relations, and constraints.
- Seed: admin user, permissions, Hyderabad delivery zone + pincodes, spin wheel,
  sample coupon, platform settings.
- Express app: Helmet, CORS, compression, cookie parsing, pino logging, layered
  rate limiting, centralized error handling, `/api/v1/health` check.
- React 19 SPA: Vite + Tailwind (brand palette), React Query, Axios client with
  transparent token refresh, code-split router, main layout, landing page.
- GitHub Actions CI: backend typecheck/lint/test + frontend lint/build.
