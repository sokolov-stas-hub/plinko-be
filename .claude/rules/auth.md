---
name: auth
description: JWT issuance, refresh-token rotation, password hashing, registration lifecycle
paths:
  - 'src/auth/**/*.ts'
  - 'src/users/**/*.ts'
  - 'test/e2e/auth*.e2e-spec.ts'
---

# Auth & Users

Triggered when editing anything under `src/auth/` or `src/users/`, or auth-related e2e specs.

## Token model

- Two **independent** JWT secrets: `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`, both ≥32 chars (enforced by [src/config/env.validation.ts](../../src/config/env.validation.ts)). Never collapse them or reuse one for the other purpose.
- Access TTL `JWT_ACCESS_TTL` (default `15m`), refresh TTL `JWT_REFRESH_TTL` (default `7d`).
- Every JWT payload carries a `type: 'access' | 'refresh'` field. `JwtAccessStrategy` ([src/auth/jwt-access.strategy.ts](../../src/auth/jwt-access.strategy.ts)) and `AuthService.verifyRefresh` ([src/auth/auth.service.ts](../../src/auth/auth.service.ts)) both reject tokens whose `type` doesn't match — preserves the access/refresh confusion guard. Any new token type must add a matching guard.

## Refresh tokens

- Stored as **SHA-256 hashes** in `RefreshToken.tokenHash` ([prisma/schema.prisma](../../prisma/schema.prisma)). Never store the raw token. Never return the raw token from any endpoint other than the one that just minted it.
- Every successful `POST /auth/refresh` **rotates**: the presented refresh row is marked `revokedAt = now()` and a fresh pair is issued. Re-using a revoked refresh must return 401.
- `POST /auth/logout` is `@UseGuards(JwtAccessGuard)` and revokes by `tokenHash` — body's `refreshToken` is the raw token, hashed inside the service.
- Expiry is enforced both in JWT (`expiresIn`) and at the DB row (`expiresAt`). Both must be checked on refresh.

## Passwords

- `bcrypt` with default cost from [src/auth/password.ts](../../src/auth/password.ts). Use `hashPassword` / `verifyPassword` — never call `bcrypt` directly elsewhere.
- Min length / complexity is validated at the DTO ([src/auth/dto/register.dto.ts](../../src/auth/dto/register.dto.ts)). The service trusts the DTO.

## Registration lifecycle

`UsersService.createWithSeed` ([src/users/users.service.ts](../../src/users/users.service.ts)) creates the user **and** their initial `ACTIVE` `Seed` row inside a single `prisma.$transaction`. Initial balance is `INITIAL_USER_BALANCE = 10_000_000_000n` (10B minor units). Do not split this into two transactions — a user without an active seed cannot place bets.

## Response hygiene

Never include the following in any response:

- `passwordHash`
- Raw `serverSeed` of an `ACTIVE` seed (see [seeds rule](./seeds.md))
- `RefreshToken.tokenHash`
- Stored refresh-token rows

`UsersController.me` ([src/users/users.controller.ts](../../src/users/users.controller.ts)) is the canonical "safe user" projection — copy that shape if you add new user-facing endpoints.

## Authorization model

There are no roles. Every endpoint operates on the caller's own data, enforced by `where: { userId: u.id }` filters and `ForbiddenException` on mismatch (see `BetsService.getById`, `SeedsService.reveal`). Do not add an `:userId` path param — always derive from `@CurrentUser()`.

## E2E expectations

`test/e2e/auth*.e2e-spec.ts` covers: register → login → access protected route → refresh → logout → refresh-after-logout (must 401). If you change the token shape or rotation semantics, update these specs first (TDD).
