---
name: bets
description: The critical bet write path — transactional, row-locked, double-spend-safe
paths:
  - 'src/bets/**/*.ts'
  - 'src/wallet/**/*.ts'
  - 'src/game/**/*.ts'
  - 'test/e2e/bets*.e2e-spec.ts'
---

# Bets / Wallet / Game

Triggered when editing the bet orchestrator, wallet math, game engine, or bet e2e specs. This is the most safety-critical area of the codebase.

## The bet transaction (do not break)

`BetsService.placeBet` ([src/bets/bets.service.ts](../../src/bets/bets.service.ts)) wraps the entire bet placement in `prisma.$transaction` (`maxWait: 30_000, timeout: 30_000`). Inside the transaction, in this exact order:

1. **Lock the active seed** — `SeedsService.lockActiveForUpdate(tx, userId)` runs `SELECT * FROM "Seed" WHERE userId = ? AND status = 'ACTIVE' FOR UPDATE`. Read `nonceAtBet = seed.nonce`.
2. **Compute outcome** — `play(seed.serverSeed, seed.clientSeed, nonceAtBet, rows, risk)`. Pure, deterministic.
3. **Compute payout** — `wallet.computePayout(amount, multiplier)`.
4. **Lock the user row and apply** — `WalletService.lockAndApply(tx, userId, amount, payout)` runs `SELECT balance FROM "User" WHERE id = ? FOR UPDATE`, validates funds, updates balance.
5. **Advance the seed nonce** — `seeds.advanceNonce(tx, seed.id, nonceAtBet + 1)`.
6. **Insert the bet row** with `balanceAfter` persisted on it.

**Invariants:**

- **Lock order is fixed: Seed → User.** All other paths that touch both tables must follow the same order, or you risk deadlocks.
- **Nothing escapes the transaction.** Do not call out to external services, do not `await` non-`tx` Prisma clients, do not log to anything that could block. The two `FOR UPDATE` locks are held for the entire body.
- **All four mutations (seed.nonce update, user.balance update, bet.create, balance read) must stay inside the same `$transaction`.** Moving any one out reintroduces double-spend.
- **`@@unique([seedId, nonce])` on `Bet`** ([prisma/schema.prisma](../../prisma/schema.prisma)) is the last-line defense. Never drop or weaken it. If you rename either column, update the constraint in the same migration.

## Bet input bounds

- `amount` is validated against `MIN_BET` / `MAX_BET` (`BigInt`, from env) in `placeBet`. Reject with `BadRequestException` if outside the range.
- `rows` must be an integer in `[MIN_ROWS, MAX_ROWS]` from [src/game/types.ts](../../src/game/types.ts). The engine re-asserts this; the DTO should as well.
- `risk` is the `Risk` enum (`LOW | MEDIUM | HIGH`) — must exist as a key in `PAYOUT_TABLES[risk][rows]`.

## Money math

- Balances, bet amounts, payouts: **`BigInt` end-to-end**. Never coerce to `Number` — precision loss above 2^53.
- Multipliers: stored as Postgres `Decimal(10, 4)`, used as `number` in the engine. The 4-decimal precision is load-bearing — `computePayout` does `BigInt(Math.round(multiplier * 10_000))` then divides by `10_000n`. If you ever widen precision in `PAYOUT_TABLES`, update both the DB column and the `10_000` constant in [src/wallet/wallet.service.ts](../../src/wallet/wallet.service.ts).
- Insufficient funds → `HttpException('Insufficient balance', 402)`. Do not return a different status; e2e tests assert on 402.

## Response contract

The bet response includes `balanceAfter`. It **must equal** `Bet.balanceAfter` persisted in DB. Concurrent bet tests (`test/e2e/bets-concurrent.e2e-spec.ts`) rely on this — sum of payouts and final balance must reconcile.

The response also echoes the seed commitment + client seed + nonce used, so the client can verify the outcome immediately (without revealing the raw server seed). See [seeds rule](./seeds.md) for the commit/reveal contract.

## Game engine

`play()` in [src/game/engine.ts](../../src/game/engine.ts) is pure:

- HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`) → first `rows` bytes.
- Byte `< 128` → `'L'`, `>= 128` → `'R'`.
- `bucketIndex` = count of `'R'`s, range `[0, rows]`.
- `multiplier` = `PAYOUT_TABLES[risk][rows][bucketIndex]`.

Any change to this function breaks every historical bet's reproducibility. Don't touch without a migration plan for past `Seed` rows that are still `ACTIVE`.

## Pagination

`GET /bets` uses cursor pagination on `Bet.id`, ordered by `(createdAt desc, id desc)` to stay deterministic. Pattern: `take: limit + 1`, then slice; `nextCursor = last.id` when `hasMore`. Don't switch to offset pagination — it breaks under concurrent inserts.
