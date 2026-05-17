# Plinko Backend — Design Spec

**Date:** 2026-05-17
**Status:** Approved (design phase)
**Scope:** Backend-only MVP for a Plinko iGaming service.

---

## 1. Goals

Build a backend service that powers a Plinko iGaming frontend. The backend owns:

- User accounts and JWT auth (access + refresh).
- A single internal credit balance per user (BigInt, fixed precision).
- Plinko game logic (deterministic, provably fair).
- Bet placement, payout, and history.
- Configurable rows (8–16) and risk (LOW / MEDIUM / HIGH) selection.
- Minimal risk management (min/max bet validation).
- Deployment to Fly.io with managed Postgres.

Non-goals for the MVP:

- Real-money payments / KYC / multi-currency.
- Multi-region or read replicas.
- Admin UI for adjusting payout tables (tables are hardcoded in TS).
- Daily loss/win caps, account freeze, or rate limiting beyond basic validation.
- Observability beyond structured logs + Fly.io built-ins.

---

## 2. Stack

| Concern | Choice |
|---|---|
| Runtime | Node.js 20 LTS |
| Language | TypeScript (strict) |
| Framework | NestJS 10 |
| Database | PostgreSQL 16 (Fly.io managed) |
| ORM | Prisma 5 |
| Auth | `@nestjs/jwt` + `@nestjs/passport` |
| Validation | `class-validator` + `class-transformer` via global `ValidationPipe` |
| Logging | `pino` (structured) |
| Tests | Jest (unit) + Supertest (e2e) |
| Container | Docker (multi-stage Alpine) |
| Deploy | Fly.io (single region, single VM on launch) |

---

## 3. Module Layout

```
src/
  auth/         register, login, refresh, logout, JWT strategy, guards
  users/        user entity, GET /users/me
  wallet/       atomic balance ops (debit/credit inside Prisma transactions)
  game/         pure Plinko engine + hardcoded payout tables
  bets/         POST /bets, GET /bets, GET /bets/:id
  seeds/        provably-fair lifecycle (active server seed, client seed, nonce, rotate)
  config/       env validation, app config
  common/       global filters, interceptors, BigInt serializer
  prisma/       Prisma service + migrations
  main.ts
  app.module.ts
```

**Boundary rules:**

- `game/` is a pure, deterministic module. No DB, no clock, no I/O. Function signature: `play(serverSeed, clientSeed, nonce, rows, risk) -> { path, bucketIndex, multiplier }`. Trivially unit-testable.
- `bets/` orchestrates: reads/advances seed via `seeds/`, calls `game.play()`, performs balance debit + credit through `wallet/` inside one Prisma transaction.
- `wallet/` exposes only atomic operations that take a Prisma transaction client. No direct controllers.
- `seeds/` encapsulates all provably-fair logic. Other modules see only `getActiveAndAdvanceNonce(userId, tx)`.

---

## 4. Data Model (Prisma)

```prisma
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String
  balance       BigInt   @default(0)        // minimal units; 1 credit = 1_000_000
  createdAt     DateTime @default(now())

  bets          Bet[]
  seeds         Seed[]
  refreshTokens RefreshToken[]
}

model RefreshToken {
  id         String    @id @default(uuid())
  userId     String
  tokenHash  String    @unique             // SHA-256 of token, never the raw token
  expiresAt  DateTime
  revokedAt  DateTime?
  createdAt  DateTime  @default(now())

  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model Seed {
  id              String     @id @default(uuid())
  userId          String
  serverSeed      String                       // 64 hex chars, crypto.randomBytes(32)
  serverSeedHash  String                       // SHA-256(serverSeed) — revealed up-front
  clientSeed      String                       // user-supplied or default random
  nonce           Int        @default(0)
  status          SeedStatus @default(ACTIVE)
  createdAt       DateTime   @default(now())
  revealedAt      DateTime?

  user            User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  bets            Bet[]

  @@index([userId, status])
}

enum SeedStatus {
  ACTIVE
  REVEALED
}

model Bet {
  id           String   @id @default(uuid())
  userId       String
  seedId       String
  nonce        Int                                // nonce value at bet time
  amount       BigInt
  rows         Int                                // 8..16
  risk         Risk
  path         String                             // "LRLRLRLRLR" — length == rows
  bucketIndex  Int
  multiplier   Decimal  @db.Decimal(10, 4)        // snapshot of multiplier applied
  payout       BigInt                             // floor(amount * multiplier)
  balanceAfter BigInt                             // snapshot for history
  createdAt    DateTime @default(now())

  user         User     @relation(fields: [userId], references: [id])
  seed         Seed     @relation(fields: [seedId], references: [id])

  @@index([userId, createdAt(sort: Desc)])
  @@unique([seedId, nonce])                       // invariant: 1 (seed,nonce) -> 1 bet
}

enum Risk {
  LOW
  MEDIUM
  HIGH
}
```

**Key decisions:**

- `balance: BigInt` — minimal units, no floats. Global interceptor serializes BigInt as JSON string.
- `RefreshToken.tokenHash` — only the hash is stored, so a DB leak cannot be used to forge sessions.
- `Seed.status` — exactly one ACTIVE seed per user at a time. Rotation flips current to REVEALED (raw server seed becomes readable) and creates a new ACTIVE.
- `Bet.path` — stored as L/R string; lets the frontend replay the drop animation without recomputation.
- `Bet.multiplier` — denormalized snapshot for audit, even if payout tables change in code later.
- `@@unique([seedId, nonce])` — protects the provably-fair invariant against race conditions.
- `Bet.balanceAfter` — snapshot in history; avoids reconstructing balance from a sum.

Payout tables are **not** in the DB — they live in `src/game/payout-tables.ts`.

---

## 5. API Surface

All endpoints under `/api/v1`. JSON in/out. JWT in `Authorization: Bearer <token>`.

### 5.1 Auth

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/auth/register` | — | `{ email, password }` | `{ user: { id, email }, accessToken, refreshToken }` |
| POST | `/auth/login` | — | `{ email, password }` | `{ accessToken, refreshToken }` |
| POST | `/auth/refresh` | — | `{ refreshToken }` | `{ accessToken, refreshToken }` (old token revoked) |
| POST | `/auth/logout` | JWT | `{ refreshToken }` | `204` |

- Access token TTL: 15 min. Refresh token TTL: 7 days.
- Password rules: min 8 chars, at least one letter and one digit.
- Refresh rotation: every `/auth/refresh` revokes the presented token and issues a new pair.

### 5.2 User

| Method | Path | Auth | Response |
|---|---|---|---|
| GET | `/users/me` | JWT | `{ id, email, balance: "4593240000", createdAt }` |

Balance top-up is **not** in the MVP. For test data we use a seed script (or a dev-only endpoint gated by `NODE_ENV !== 'production'`).

### 5.3 Game / Bets

| Method | Path | Auth | Body / Query | Response |
|---|---|---|---|---|
| GET | `/game/config` | — | — | `{ rows: [8..16], risks: ["LOW","MEDIUM","HIGH"], minBet, maxBet, payoutTables }` |
| POST | `/bets` | JWT | `{ amount, rows, risk }` | see below |
| GET | `/bets` | JWT | `?limit=20&cursor=<betId>&risk=HIGH&rows=10` | `{ items: [...], nextCursor }` |
| GET | `/bets/:id` | JWT | — | full bet object |

**`POST /bets` response:**

```json
{
  "betId": "uuid",
  "amount": "100000000",
  "rows": 10,
  "risk": "HIGH",
  "path": "LRLRRLLRLR",
  "bucketIndex": 5,
  "multiplier": "0.2000",
  "payout": "20000000",
  "balanceAfter": "4513240000",
  "seed": {
    "serverSeedHash": "abc123...",
    "clientSeed": "user-chosen",
    "nonce": 42
  }
}
```

**`GET /bets`:**

- Cursor-based pagination (stable when new bets arrive).
- Sort: `createdAt DESC, id DESC`.
- Optional filters: `risk` (LOW/MEDIUM/HIGH), `rows` (8..16).

### 5.4 Provably Fair

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/seeds/active` | JWT | — | `{ serverSeedHash, clientSeed, nonce }` |
| POST | `/seeds/client` | JWT | `{ clientSeed }` | updates `clientSeed` on the ACTIVE seed, **only if `nonce == 0`** |
| POST | `/seeds/rotate` | JWT | `{ newClientSeed? }` | reveals old (returns `serverSeed`), creates a new ACTIVE |
| GET | `/seeds/:id` | JWT | — | REVEALED seed: `{ serverSeed, serverSeedHash, clientSeed, nonceMax }` |

Rationale for `nonce == 0` constraint on `/seeds/client`: changing the client seed mid-stream would change every subsequent result, undermining the commitment. Force a rotate instead.

### 5.5 Global

- `GET /health` — no auth, returns `200` with `{ status: "ok" }`. Used by Fly.io health check.
- BigInt → JSON string via global interceptor.
- Errors: `{ statusCode, message, error }` via NestJS exception filter.
- Status codes:
  - `400` validation
  - `401` missing/invalid JWT
  - `402` insufficient balance
  - `404` not found
  - `409` race conditions (seed/nonce conflict — unlikely thanks to `SELECT ... FOR UPDATE`)

---

## 6. Bet Flow (POST /bets)

1. JWT guard authenticates user.
2. DTO validation: `amount > 0`, `rows ∈ [8..16]`, `risk ∈ {LOW, MEDIUM, HIGH}`.
3. Risk management: `MIN_BET ≤ amount ≤ MAX_BET`.
4. Prisma transaction:
   1. `SELECT balance FROM users WHERE id = $userId FOR UPDATE`.
   2. If `balance < amount` → throw 402.
   3. `SELECT seed FROM seeds WHERE userId = $userId AND status = 'ACTIVE' FOR UPDATE`.
   4. `nonce = seed.nonce; UPDATE seeds SET nonce = nonce + 1`.
   5. `{ path, bucketIndex, multiplier } = game.play(seed.serverSeed, seed.clientSeed, nonce, rows, risk)`.
   6. `payout = floor(amount * multiplier)` (BigInt math via Decimal helpers).
   7. `UPDATE users SET balance = balance - amount + payout`.
   8. `INSERT INTO bets (...)` with `seedId`, `nonce`, snapshots.
5. Return the bet response (section 5.3).

Atomicity guarantees: balance debit, seed advance, and bet insert either all succeed or all roll back. Concurrent bets from the same user serialize on the `FOR UPDATE` locks.

---

## 7. Plinko Engine

### 7.1 Pure function

```ts
function play(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  rows: number,
  risk: Risk,
): { path: ('L'|'R')[]; bucketIndex: number; multiplier: number }
```

### 7.2 Algorithm (Stake-style HMAC)

1. `hmac = HMAC_SHA256(key = serverSeed, message = ${clientSeed}:${nonce})` → 32 bytes.
2. For each row `i` in `0..rows-1`:
   - Take byte `hmac[i]`.
   - `byte < 128` → `L`, else `R` (exact 50/50, no bias).
3. `bucketIndex = count(path, 'R')` → range `0..rows`.
4. `multiplier = PAYOUT_TABLES[risk][rows][bucketIndex]`.

For up to 16 rows we only need 16 bytes, so a single HMAC output always suffices.

### 7.3 Payout tables

`src/game/payout-tables.ts`:

```ts
export const PAYOUT_TABLES: Record<Risk, Record<number, number[]>> = {
  LOW:    { 8: [...9 values...], 9: [...10...], ..., 16: [...17...] },
  MEDIUM: { 8: [...], ..., 16: [...] },
  HIGH:   { 8: [...], ..., 16: [...] },
};
```

- Values sourced from standard Stake-style tables targeting RTP ≈ 99%.
- Symmetric: `table[i] === table[rows - i]`.
- Reference for 10/HIGH (from the screenshot): `[76, 10, 3, 0.9, 0.3, 0.2, 0.3, 0.9, 3, 10, 76]`.

### 7.4 Provably Fair lifecycle

1. **On registration:** auto-create one `Seed` row.
   - `serverSeed = crypto.randomBytes(32).toString('hex')`
   - `serverSeedHash = sha256(serverSeed)`
   - `clientSeed = crypto.randomBytes(16).toString('hex')` (user can override while `nonce == 0`)
   - `nonce = 0`
2. **Player view (`GET /seeds/active`):** sees `serverSeedHash`, `clientSeed`, `nonce`. The hash is a commitment.
3. **Each bet:** transaction increments `nonce`, calls `play(...)`, stores `(seedId, nonce, path, multiplier, payout)` in the bet.
4. **Rotate (`POST /seeds/rotate`):**
   - Old seed: `status = REVEALED`, `revealedAt = now()`. From now on `GET /seeds/:id` returns the raw `serverSeed`.
   - Player verifies `sha256(serverSeed) === serverSeedHash` and re-runs the HMAC for each historical bet to confirm `path`/`bucketIndex`.
   - A new ACTIVE seed is generated.

### 7.5 Invariants verified by tests

- `play()` is deterministic — same inputs, same outputs (table-driven test).
- `path.length === rows`.
- `bucketIndex === count(path, 'R')`.
- `multiplier === PAYOUT_TABLES[risk][rows][bucketIndex]`.
- Distribution sanity check: 100K plays with a fixed seed produce a bucket distribution close to the binomial expectation (loose tolerance).
- Race-condition e2e: 100 concurrent `POST /bets` for one user produce 100 unique `(seedId, nonce)` pairs with no lost updates (against a real Postgres in test env).

---

## 8. Risk Management (MVP)

Minimum only:

- `MIN_BET` and `MAX_BET` from env, validated on every `POST /bets`.
- Server-side validation only — never trust client.

Out of scope for MVP (kept here for future planning):

- Global `MAX_PAYOUT_PER_BET` cap.
- Per-user rate limiting on `/bets`.
- Daily loss/win caps.
- Account freeze / admin actions.

---

## 9. Auth Details

- Library: `@nestjs/jwt` + `@nestjs/passport` (`passport-jwt` strategy).
- Access token: HS256, secret `JWT_ACCESS_SECRET`, TTL 15 min, payload `{ sub: userId, type: "access" }`.
- Refresh token: HS256, secret `JWT_REFRESH_SECRET` (must differ from access), TTL 7 days, payload `{ sub: userId, type: "refresh", jti: tokenId }`.
- Refresh tokens persisted as SHA-256 hashes in `RefreshToken`. Verification: decode JWT → look up by `tokenHash = sha256(presented)` → check `revokedAt IS NULL AND expiresAt > now()`.
- Rotation on every `/auth/refresh`: mark old `revokedAt = now()`, issue new pair.
- Logout: mark presented refresh token revoked. Access tokens expire naturally within 15 min (no denylist).

---

## 10. Configuration & Secrets

Validated at boot via `class-validator` in `src/config/env.validation.ts` — app fails to start on missing/invalid values.

| Variable | Example | Source |
|---|---|---|
| `DATABASE_URL` | `postgres://...` | Fly Postgres attach |
| `JWT_ACCESS_SECRET` | random 64 bytes | `fly secrets set` |
| `JWT_REFRESH_SECRET` | random 64 bytes | `fly secrets set` |
| `JWT_ACCESS_TTL` | `15m` | env |
| `JWT_REFRESH_TTL` | `7d` | env |
| `MIN_BET` | `1000000` (= 1 credit) | env |
| `MAX_BET` | `1000000000000` (= 1M credits) | env |
| `PORT` | `3000` | env |
| `NODE_ENV` | `production` | env |

Profiles:

| Profile | Use | DB |
|---|---|---|
| `.env.local` | local dev | local Docker Postgres (`docker-compose.yml`) |
| `.env.test` | Jest e2e | local DB `plinko_test` |
| Fly.io secrets | production | Fly Postgres |

---

## 11. Deployment (Fly.io)

### 11.1 Topology

- One Fly.io app: `plinko-be`.
- Single region on launch (pick a region close to target users, e.g. `fra`).
- One VM (`shared-cpu-1x`, 512 MB) initially; scale by editing `[[vm]]`.
- Fly Postgres cluster, single primary, no replicas.
- TLS terminated by Fly (`https://plinko-be.fly.dev`); custom domain later.

### 11.2 Dockerfile (multi-stage)

```
Stage 1 builder:
  FROM node:20-alpine
  COPY package.json package-lock.json ./
  RUN npm ci
  COPY . .
  RUN npx prisma generate && npm run build

Stage 2 runtime:
  FROM node:20-alpine
  COPY package.json package-lock.json ./
  RUN npm ci --omit=dev
  COPY --from=builder /app/dist ./dist
  COPY --from=builder /app/prisma ./prisma
  COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
  EXPOSE 3000
  CMD ["node", "dist/main.js"]
```

### 11.3 fly.toml (key bits)

```toml
app = "plinko-be"
primary_region = "fra"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "3000"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  min_machines_running = 1

  [[http_service.checks]]
    interval = "15s"
    timeout = "2s"
    grace_period = "10s"
    method = "GET"
    path = "/health"

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512

[deploy]
  release_command = "npx prisma migrate deploy"
```

`release_command` runs migrations once per deploy, before new VMs receive traffic. Keeps multi-instance safe later.

### 11.4 CI/CD

- GitHub Actions:
  - On PR: lint, typecheck, unit tests, e2e tests (with PostgreSQL service container).
  - On push to `main`: build + `flyctl deploy --remote-only`.
- No preview environments in MVP.

### 11.5 Out-of-scope for MVP (recorded for later)

- Read replicas / multi-region.
- PgBouncer / external connection pooler (Prisma's built-in pool is enough at one VM).
- External APM (Sentry, Datadog). Use Fly.io logs + `pino` structured logs.
- Manual backups (Fly Postgres takes daily snapshots).

---

## 12. Testing Strategy

- **Unit:** `game/engine.ts` (deterministic plays, distribution sanity, table lookups). Pure functions, no mocks needed.
- **Unit:** auth (password hashing, token sign/verify), wallet math (BigInt × Decimal payouts).
- **Integration (Jest + real Postgres in CI):** Prisma queries — seed creation, `FOR UPDATE` semantics, refresh token rotation.
- **e2e (Supertest + real Postgres):** full HTTP flows — register → login → place bet → fetch history → rotate seed → verify revealed seed.
- **Race test:** 100 concurrent `POST /bets` for one user; assert no duplicate `(seedId, nonce)` and balance reconciles.

---

## 13. Open Questions / Deferred Decisions

- Initial balance for new users: TBD by product. Default in code: 0 (use seed/dev endpoint for testing).
- Exact RTP target for hardcoded payout tables: aim for ~99% per industry norm; final values selected during implementation and pinned in tests.
- Region for Fly.io primary: pick during deploy step based on target user geography.
