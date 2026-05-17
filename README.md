# plinko-be

NestJS + Prisma + Postgres backend for a Plinko iGaming demo.

## Stack
- Node.js 20 + TypeScript + NestJS 10
- PostgreSQL 16 (Fly.io managed in prod, Docker locally)
- Prisma 5
- JWT auth (access 15m + refresh 7d, hashed refresh tokens)
- Provably-fair (HMAC-SHA256, server seed commitment + reveal)

## Local dev

```bash
docker compose up -d
cp .env.example .env
npm install
npm run prisma:migrate
npm run start:dev
```

App on `http://localhost:3000`. Health: `GET /health`. API prefix `/api/v1`.

## Tests

```bash
npm test          # unit
npm run test:e2e  # e2e (requires Postgres)
```

## Deploy

```bash
flyctl launch --no-deploy           # one-time
flyctl postgres create
flyctl postgres attach <pg-app>
flyctl secrets set \
  JWT_ACCESS_SECRET=$(openssl rand -hex 32) \
  JWT_REFRESH_SECRET=$(openssl rand -hex 32) \
  JWT_ACCESS_TTL=15m JWT_REFRESH_TTL=7d \
  MIN_BET=1000000 MAX_BET=1000000000000
flyctl deploy
```

## Docs
- Spec: `docs/superpowers/specs/2026-05-17-plinko-backend-design.md`
- Plan: `docs/superpowers/plans/2026-05-17-plinko-backend.md`
