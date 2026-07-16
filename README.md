# TSG eCart — Fresh Groceries Delivered Fast

A production-ready quick-commerce grocery platform serving Hyderabad, Telangana. Built as a decoupled monorepo: a React 19 + Vite SPA, an Express + Prisma REST API, MySQL, and Redis, containerized with Docker behind Nginx.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, Vite, TypeScript, Tailwind CSS, React Router, React Query, Axios, React Hook Form, Zod, Framer Motion |
| Backend | Node.js, Express, TypeScript, Prisma ORM |
| Database | MySQL 8 |
| Cache / Rate limit | Redis 7 |
| Auth | JWT access + rotating refresh tokens, bcrypt |
| Payments | Razorpay Standard Checkout, Cash on Delivery |
| Media | Cloudinary |
| Email | Nodemailer |
| Infra | Docker, Nginx, GitHub Actions CI |

## Repository Layout

```
tsgecart-web/
├── backend/     Express + Prisma REST API (TypeScript)
├── frontend/    React 19 SPA (Vite + TypeScript)
├── nginx/       Reverse proxy config
├── docs/        Architecture and API reference
└── docker-compose.yml
```

## Local Development

```bash
# 1. Copy environment templates and fill in secrets
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 2. Start infrastructure (MySQL + Redis)
docker compose up -d mysql redis

# 3. Backend
cd backend
npm install
npm run prisma:migrate
npm run seed
npm run dev

# 4. Frontend (separate terminal)
cd frontend
npm install
npm run dev
```

Backend runs on `http://localhost:4000`, frontend on `http://localhost:5173`.

## Delivery Area

TSG eCart currently delivers only within Hyderabad, Telangana. Serviceable pincodes, localities, delivery zones, charges, free-delivery limits, and ETAs are all managed by admins from the panel — no code changes required.

## Documentation

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system design and layering
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phased delivery plan
