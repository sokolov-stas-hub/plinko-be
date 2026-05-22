# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Task skills — invoke for repeatable workflows

Read the matching skill before starting one of these tasks. Skills are operational runbooks; rules (below) are subsystem invariants.

| Task | Skill |
|---|---|
| About to `git commit` anything that touches `src/`, `test/`, `prisma/`, `Dockerfile`, `fly.toml`, `.github/workflows/`, or `.Codex/` | [.Codex/skills/pre-commit/SKILL.md](.Codex/skills/pre-commit/SKILL.md) |
| Pushing to `main`, manually running `flyctl deploy`, or investigating a prod incident | [.Codex/skills/deploy-flow/SKILL.md](.Codex/skills/deploy-flow/SKILL.md) |

## Path-scoped rules — read before editing

Before editing files under any of the paths below, **read the matching rule file**. Each rule contains the invariants for that subsystem; AGENTS.md only carries cross-cutting context.

| When editing… | Read |
|---|---|
| `src/**/*.controller.ts`, `src/**/*.dto.ts`, `src/**/*.query.ts`, `src/**/*.response.ts`, `src/common/**`, `src/main.ts`, `test/e2e/**` | [.Codex/rules/api.md](.Codex/rules/api.md) |
| `src/auth/**`, `src/users/**`, `test/e2e/auth*.e2e-spec.ts` | [.Codex/rules/auth.md](.Codex/rules/auth.md) |
| `src/bets/**`, `src/wallet/**`, `src/game/**`, `test/e2e/bets*.e2e-spec.ts` | [.Codex/rules/bets.md](.Codex/rules/bets.md) |
| `src/seeds/**`, `src/game/engine.ts`, `src/game/types.ts`, `src/game/payout-tables.ts`, `test/e2e/seeds*.e2e-spec.ts` | [.Codex/rules/seeds.md](.Codex/rules/seeds.md) |
| `prisma/schema.prisma`, `prisma/migrations/**`, `src/prisma/**`, `src/**/*.service.ts` | [.Codex/rules/prisma.md](.Codex/rules/prisma.md) |

A file can match more than one rule (e.g. `src/bets/bets.service.ts` triggers both `bets` and `prisma`). Read all matches.

The `paths:` glob list lives in each rule's YAML frontmatter — it is the machine-readable source of truth and will later be consumed by `.Codex/hooks/` and the source-to-doc mapping (see [docs/superpowers/plans/2026-05-19-ai-workflow.md](docs/superpowers/plans/2026-05-19-ai-workflow.md)). When adding a new rule, mirror the frontmatter shape and add a row to the table above.

## Commands

```bash
# Local dev (Postgres must be running — `docker compose up -d`)
npm run start:dev            # nest watch mode, app on http://localhost:3000

# Verification
npm run typecheck            # tsc --noEmit, NO emit — run before claiming work compiles
npm run lint                 # eslint --fix on src/**/*.ts and test/**/*.ts
npm test                     # Jest unit specs (rootDir = src, *.spec.ts)
npm test -- path/to/file.spec.ts          # single unit file
npm test -- -t "name of test"             # filter by test name
npm run test:e2e             # Jest e2e (test/e2e/*.e2e-spec.ts, --runInBand, needs real Postgres)

# Prisma
npm run prisma:generate      # regenerate client after editing prisma/schema.prisma
npm run prisma:migrate       # create + apply a new migration in dev
npm run prisma:deploy        # apply migrations in CI/prod
```

The Swagger UI is mounted at `GET /docs` once the app is running; OpenAPI JSON at `/docs-json`.

## Architecture overview

**Stack:** NestJS 10 + Prisma 5 + PostgreSQL 16, JWT auth, provably-fair RNG. All HTTP routes are under `/api/v1` except `/health` (excluded from the global prefix in [src/main.ts](src/main.ts)).

### Module graph

`AppModule` wires these feature modules — most depend on `PrismaModule` and `ConfigModule`. Subsystem-level invariants live in the rule files linked above; this is just the map.

| Module | Responsibility | Rule |
|---|---|---|
| [src/auth](src/auth/) | Registration, login, JWT issuance, refresh-token rotation | [auth](.Codex/rules/auth.md) |
| [src/users](src/users/) | `findByEmail` / `findById` / `createWithSeed` (user + initial seed in one tx) | [auth](.Codex/rules/auth.md) |
| [src/seeds](src/seeds/) | Provably-fair server/client seed lifecycle (commit → bet → reveal/rotate) | [seeds](.Codex/rules/seeds.md) |
| [src/wallet](src/wallet/) | Pure payout math + row-locking `lockAndApply` used inside the bet tx | [bets](.Codex/rules/bets.md) |
| [src/game](src/game/) | Deterministic `play()` engine, payout tables, `GET /game/config` | [seeds](.Codex/rules/seeds.md), [bets](.Codex/rules/bets.md) |
| [src/bets](src/bets/) | `POST /bets` orchestrator that ties seeds + wallet + engine together | [bets](.Codex/rules/bets.md) |
| [src/common](src/common/) | Global exception filter, BigInt interceptor, `GET /health` | [api](.Codex/rules/api.md) |
| [src/prisma](src/prisma/) | `PrismaService` wrapper, `@Global()` module | [prisma](.Codex/rules/prisma.md) |
| [src/config](src/config/) | `EnvSchema` (class-validator) — refuses to boot on missing/short secrets | — |

There is no `Wallet` table; balance lives on `User`. There is no role/permission layer — every user only acts on their own resources, enforced via `userId` filters in services.

### Global pipeline (set in `main.ts`)

Four things are installed globally and you should not duplicate them elsewhere:

1. `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })` — DTOs are strict; unknown fields are rejected; `class-transformer` decorators run (this is what coerces JSON strings to `BigInt` on bet amounts).
2. `BigIntInterceptor` — recursively stringifies every `bigint` in responses (`JSON.stringify` cannot serialize BigInt natively). Controllers return raw bigints; the interceptor handles the wire format.
3. `AllExceptionsFilter` — normalizes every error to `{ statusCode, message, error, path }`.
4. Pino logger (`nestjs-pino`) with redaction of `req.headers.authorization`, `req.body.password`, `req.body.refreshToken`.

See [.Codex/rules/api.md](.Codex/rules/api.md) for the contracts these enforce.

### Money representation (cross-cutting)

Balances, bet amounts, payouts, and `MIN_BET`/`MAX_BET` are `BigInt` end-to-end. Multipliers are `Decimal(10,4)` in Postgres and `number` in the engine. Two pieces support this:

- [src/config/env.validation.ts](src/config/env.validation.ts) parses `MIN_BET` / `MAX_BET` to `BigInt` at boot.
- [src/common/interceptors/bigint.interceptor.ts](src/common/interceptors/bigint.interceptor.ts) stringifies bigints in responses.

The exact payout math (fixed-point `* 10_000`) lives in [.Codex/rules/bets.md](.Codex/rules/bets.md).

### Swagger / DTO file naming

`nest-cli.json` enables the `@nestjs/swagger` CLI plugin with `dtoFileNameSuffix: ['.dto.ts', '.query.ts', '.response.ts']`. **OpenAPI schemas are auto-generated only for files matching those suffixes** — keep DTOs in `dto/` subfolders with those exact suffixes or they won't appear in `/docs`. Full convention in [.Codex/rules/api.md](.Codex/rules/api.md).

## Testing notes

- Unit tests (`*.spec.ts`) live next to source under `src/`. Pure-function specs (engine, password hashing, duration parsing) are the canonical examples.
- E2E tests live in `test/e2e/*.e2e-spec.ts`, run with `--runInBand`, and require a running Postgres (use `docker compose up -d`).
- When a change touches `prisma/schema.prisma`, run `npm run prisma:generate` before `npm run typecheck` — types come from the generated client.

## Environment

`.env.example` is the source of truth for required vars. `EnvSchema` will refuse to boot the app if any are missing or malformed (in particular `JWT_*_SECRET` must be ≥32 chars). In dev, `LOG_LEVEL=debug` and Pino uses `pino-pretty`; in production Pino emits JSON.

## Deploy

Fly.io app defined in [fly.toml](fly.toml), image built from [Dockerfile](Dockerfile) (`node:20-slim` for Prisma's OpenSSL deps). Migrations are applied by `prisma migrate deploy` — never run `prisma migrate dev` against production.

## Reference docs in-repo

- [docs/superpowers/specs/2026-05-17-plinko-backend-design.md](docs/superpowers/specs/2026-05-17-plinko-backend-design.md) — backend design spec (API shapes, threat model, fairness protocol).
- [docs/superpowers/specs/2026-05-18-plinko-frontend-requirements.md](docs/superpowers/specs/2026-05-18-plinko-frontend-requirements.md) — frontend contract this BE must satisfy.
- [docs/superpowers/plans/2026-05-17-plinko-backend.md](docs/superpowers/plans/2026-05-17-plinko-backend.md) — original implementation plan.
- [docs/superpowers/plans/2026-05-19-ai-workflow.md](docs/superpowers/plans/2026-05-19-ai-workflow.md) — in-flight plan for the agent workflow (this file, rules, hooks, mappings).
