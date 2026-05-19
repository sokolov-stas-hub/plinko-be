---
name: seeds
description: Provably-fair seed lifecycle — commitment, client-seed mutability, reveal protocol
paths:
  - 'src/seeds/**/*.ts'
  - 'src/game/engine.ts'
  - 'src/game/engine.spec.ts'
  - 'src/game/types.ts'
  - 'src/game/payout-tables.ts'
  - 'test/e2e/seeds*.e2e-spec.ts'
---

# Seeds / Provably-fair

Triggered when editing the seed service, the deterministic engine, payout tables, or seed e2e specs.

## The fairness contract

A bet is "provably fair" because:

1. Before the bet, the server commits to a hidden `serverSeed` by publishing only its SHA-256 (`serverSeedHash`).
2. The user can pin their own `clientSeed` (or use the random one we issued).
3. Each bet uses a strictly-increasing `nonce`.
4. After the user rotates to a new seed, the original `serverSeed` is revealed, and any past bet can be reproduced by re-running `play(serverSeed, clientSeed, nonce, rows, risk)`.

Every rule below exists to protect this contract.

## Active seed invariants

- An `ACTIVE` seed's raw `serverSeed` **must never leak**. The only fields exposed by `GET /seeds/active` are `{ serverSeedHash, clientSeed, nonce }` — see `SeedsService.getActiveForUser` ([src/seeds/seeds.service.ts](../../src/seeds/seeds.service.ts)). Any new endpoint must apply the same projection.
- A user has at most one `ACTIVE` seed at any time. `createWithSeed` and `rotate` are the only paths that create seeds, and both run inside a `$transaction` that flips the prior active to `REVEALED` first.
- `serverSeedHash` = `sha256(serverSeed)` is enforced by `hashServerSeed`. Don't pre-compute hashes elsewhere — always go through that helper.

## Client seed mutability

- The client seed can be edited **only while `nonce === 0`** (`SeedsService.updateClientSeed`). After the first bet, the seed is fingerprinted — changing the client seed retroactively would invalidate every bet on that seed.
- To "change the client seed" mid-stream the user must rotate (`POST /seeds/rotate`), which reveals the current seed and creates a fresh `ACTIVE` one. `rotate` accepts an optional `newClientSeed` for the freshly created seed.

## Nonce lifecycle

- `nonce` starts at `0` for every new seed.
- It is incremented **only** inside the bet transaction via `SeedsService.advanceNonce(tx, seedId, nonceAtBet + 1)`. No other code path mutates nonce.
- `nonce` never decrements, never resets. `@@unique([seedId, nonce])` on `Bet` makes any violation a DB-level error.
- When persisting a revealed seed (`status = REVEALED`), its current `nonce` is the `nonceMax` — the inclusive upper bound for `nonce` values that exist as bets on that seed.

## Reveal protocol

`SeedsService.reveal` ([src/seeds/seeds.service.ts](../../src/seeds/seeds.service.ts)) returns `{ serverSeed, serverSeedHash, clientSeed, nonceMax }` **only** when:

- `Seed.userId === caller.id`, and
- `Seed.status === 'REVEALED'`.

A still-`ACTIVE` seed must respond with `BadRequestException('Seed is still ACTIVE; rotate before revealing')`. Do not loosen this — exposing an `ACTIVE` `serverSeed` lets a user predict future bets.

## Engine purity

`play()` in [src/game/engine.ts](../../src/game/engine.ts) must remain:

- **Pure** — no DB access, no I/O, no `Math.random`, no `Date.now`. Only HMAC + lookup.
- **Deterministic** — same `(serverSeed, clientSeed, nonce, rows, risk)` → same `(path, bucketIndex, multiplier)` forever.
- **Versionless** — there is no engine version field on `Bet`. If you must change the function, you must either (a) version it and persist the version on `Bet`, or (b) migrate every `ACTIVE` seed by force-revealing it before the deploy.

`engine.spec.ts` pins a handful of known vectors. If a vector changes, you broke fairness — investigate, don't update the test.

## Payout tables

`PAYOUT_TABLES[risk][rows]` ([src/game/payout-tables.ts](../../src/game/payout-tables.ts)) is an array of length `rows + 1`. Every entry must be a number with at most 4 decimal places (matches the `Decimal(10,4)` DB column and the `10_000` scaling factor in `WalletService.computePayout`). Symmetry around the middle bucket is the convention but not enforced — if you break it, document why.
