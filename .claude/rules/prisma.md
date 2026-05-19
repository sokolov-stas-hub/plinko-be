---
name: prisma
description: Schema, migrations, transactions, row-level locking, BigInt/Decimal mapping
paths:
  - 'prisma/schema.prisma'
  - 'prisma/migrations/**/*.sql'
  - 'src/prisma/**/*.ts'
  - 'src/**/*.service.ts'
---

# Prisma / Database

Triggered when editing the schema, migrations, the Prisma module, or any service that runs queries.

## Migrations

- **Never edit an applied migration in-place.** Any change to `prisma/schema.prisma` must produce a **new** migration via `npm run prisma:migrate` (which calls `prisma migrate dev`). Editing a migration that's already in `prisma_migrations` history will diverge dev from prod.
- The only time you may rewrite a migration is when it has only ever run against a disposable local DB and has not been pushed. Confirm with `git log -- prisma/migrations/` before doing so.
- In CI / prod we run `prisma migrate deploy` (`npm run prisma:deploy`), never `migrate dev`. If a migration requires a backfill, write the SQL in a separate `*.sql` step inside the same migration directory.
- Run `npm run prisma:generate` after any schema change so the TypeScript client types reflect the new shape, then re-run `npm run typecheck`.

## Schema invariants

These constraints are load-bearing for correctness — do not drop without a replacement that preserves the same guarantee:

- `Bet @@unique([seedId, nonce])` — last-line defense against double-spending a nonce. See [bets rule](./bets.md).
- `RefreshToken.tokenHash @unique` — token rotation depends on it. See [auth rule](./auth.md).
- `Seed @@index([userId, status])` — `getActiveForUser` / `lockActiveForUpdate` hit this index.
- `Bet @@index([userId, createdAt(sort: Desc)])` — cursor pagination for `GET /bets`.
- `User.email @unique` — registration uniqueness.

`onDelete: Cascade` on `RefreshToken.user` and `Seed.user` is intentional — user deletion (if added) must cascade. `Bet.user` and `Bet.seed` have no cascade — bets are immutable history.

## Type mapping

- Money columns (`User.balance`, `Bet.amount`, `Bet.payout`, `Bet.balanceAfter`) are Postgres `BIGINT` → Prisma `BigInt` → TypeScript `bigint`. Never declare a money column as `Int` or `Decimal`.
- `Bet.multiplier` is `Decimal(10, 4)`. Do not widen without updating the `10_000` scaling factor in [src/wallet/wallet.service.ts](../../src/wallet/wallet.service.ts).
- Timestamps are `DateTime @default(now())`. Use `revokedAt: DateTime?` style nullable fields for "event happened" flags — preferred over boolean + timestamp.

## Transactions

- Use `prisma.$transaction(async tx => { … })` for any operation that touches more than one row whose consistency must be enforced together (bet placement, registration-with-seed, seed rotation). The bet path also sets `{ maxWait: 30_000, timeout: 30_000 }` because it holds row locks; copy that pattern for any other long-running locked transaction.
- Helpers that participate in a transaction take a `Prisma.TransactionClient` argument as the first parameter (`SeedsService.lockActiveForUpdate`, `WalletService.lockAndApply`, `SeedsService.createForUser`). Follow the same convention: never reach back to `this.prisma` from inside a transaction.

## Row-level locking

Prisma's query API has no `FOR UPDATE`. Use raw SQL inside the transaction:

```ts
const rows = await tx.$queryRaw<Seed[]>`
  SELECT * FROM "Seed"
  WHERE "userId" = ${userId} AND status = 'ACTIVE'
  FOR UPDATE
`;
```

- Always parameterize with the tagged-template form (`${value}`), never string interpolation.
- Use `$queryRaw<T[]>` and remember Postgres column quoting (`"userId"` not `userId`).
- Lock ordering for the bet path: **Seed → User**. Any future code that locks both must follow the same order.

## PrismaService lifecycle

[src/prisma/prisma.service.ts](../../src/prisma/prisma.service.ts) extends `PrismaClient` and connects on module init. It is `@Global()` via `PrismaModule` — inject `PrismaService` directly; do not instantiate `new PrismaClient()` anywhere else.

## Testing

- Unit tests must not hit the DB. Mock services or use pure functions. `engine.spec.ts`, `password.spec.ts`, `duration.spec.ts`, `wallet.service.spec.ts` are good models.
- E2E specs in `test/e2e/` boot the full app and require a real Postgres (`docker compose up -d`). They run with `--runInBand` because they share the DB.
- A schema change without a matching e2e/test update is a red flag — at minimum, run `npm run test:e2e` against the new migration locally before committing.
