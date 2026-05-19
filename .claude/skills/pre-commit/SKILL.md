---
name: pre-commit
description: Use before every `git commit` in plinko-be to run typecheck/lint/related tests and verify that path-scoped rules in .claude/rules/ are still accurate for the changed source files
---

# Pre-commit workflow

## Overview

Before committing, verify three things in this order:

1. **Mechanical checks pass** — typecheck, lint, related tests.
2. **Source ↔ test coverage** — every changed source file under `src/` has a matching test change (or an explicit waiver).
3. **Rules freshness** — for every changed source file, the path-scoped rule in `.claude/rules/` that matches it still describes truth.

If any step fails, **do not commit**. Either fix the failure or document an explicit exception in the commit body.

## When to use

- Use before any `git commit` that touches `src/`, `test/`, `prisma/`, `Dockerfile`, `fly.toml`, `.github/workflows/`, or `.claude/`.
- Skip only for pure markdown changes outside `.claude/rules/` (e.g. `README.md`, `docs/`).
- This skill is the manual version of the future `.claude/hooks/pre-commit-gate.sh` (planned in Фаза 5 of [docs/superpowers/plans/2026-05-19-ai-workflow.md](../../../docs/superpowers/plans/2026-05-19-ai-workflow.md)). Until the hook lands, the agent runs the checklist by hand.

## Workflow

### Step 1 — Inspect the diff

```bash
git status --short
git diff --staged --name-only
git diff --staged
```

Categorize changed files:

- **source code:** `src/**/*.ts` excluding `*.spec.ts`
- **tests:** `src/**/*.spec.ts`, `test/e2e/**/*.e2e-spec.ts`
- **schema:** `prisma/schema.prisma`, `prisma/migrations/**`
- **build/deploy:** `Dockerfile`, `fly.toml`, `.github/workflows/**`, `package.json`, `nest-cli.json`, `tsconfig*.json`
- **rules/skills:** `.claude/rules/**`, `.claude/skills/**`, `CLAUDE.md`

### Step 2 — Mechanical checks

Run in this order, fix-and-rerun on failure:

```bash
npm run typecheck     # tsc --noEmit
npm run lint          # eslint --fix
```

Then targeted tests for the changed files:

```bash
# Unit: any *.spec.ts that exists next to a changed source file, or that imports a changed file
npm test -- <path-to-spec>

# E2E: required if change touches src/auth, src/bets, src/seeds, src/wallet, src/game,
# any controller, any DTO, prisma/schema.prisma, or src/main.ts
docker compose up -d  # only if Postgres isn't already up
npm run test:e2e
```

If schema changed: `npm run prisma:generate` BEFORE `npm run typecheck` (the client types come from the generated file).

### Step 3 — Source ↔ test coverage policy

Apply this table to the staged diff:

| Changed file class | Expected test change |
|---|---|
| `src/bets/**`, `src/wallet/**`, `src/game/**` (non-spec) | A `*.spec.ts` next to it OR a `test/e2e/bets*.e2e-spec.ts` |
| `src/auth/**`, `src/users/**` (non-spec) | A `*.spec.ts` next to it OR `test/e2e/auth*.e2e-spec.ts` |
| `src/seeds/**` (non-spec) | A `*.spec.ts` next to it OR `test/e2e/seeds*.e2e-spec.ts` |
| `src/common/**` (filter/interceptor) | A unit `*.spec.ts` or an e2e that exercises it |
| `prisma/schema.prisma` or new migration | At least one e2e exercising the new field/constraint |
| Pure rename/refactor, no behavior change | A short note in the commit body: `Refactor: no behavior change` |

If you can't add a test, write **why** in the commit body. Don't silently skip.

### Step 4 — Rules freshness check

For every changed source file, walk through this:

```bash
# 1. Find which rules claim ownership of the changed paths.
ls .claude/rules
# 2. Read the matching rule's `paths:` frontmatter — if your path matches a glob there,
#    that rule is in scope.
# 3. Re-read the rule body. Ask:
#    - Does any invariant the rule states still hold after my change?
#    - Does any code snippet / file path in the rule still resolve?
#    - Did I introduce a NEW invariant, response shape, lock, env var, or constraint
#      that the rule should mention?
# 4. If the rule is stale → update the rule in the SAME commit (or a preceding one).
#    Never commit a code change that contradicts a rule without updating the rule.
```

Mapping (matches `paths:` in each file's frontmatter):

| Changed under… | Re-read |
|---|---|
| `src/**/*.controller.ts`, `*.dto.ts`, `*.query.ts`, `*.response.ts`, `src/common/**`, `src/main.ts`, `test/e2e/**` | `.claude/rules/api.md` |
| `src/auth/**`, `src/users/**`, `test/e2e/auth*` | `.claude/rules/auth.md` |
| `src/bets/**`, `src/wallet/**`, `src/game/**`, `test/e2e/bets*` | `.claude/rules/bets.md` |
| `src/seeds/**`, `src/game/engine.ts`, `src/game/types.ts`, `src/game/payout-tables.ts`, `test/e2e/seeds*` | `.claude/rules/seeds.md` |
| `prisma/schema.prisma`, `prisma/migrations/**`, `src/prisma/**`, `src/**/*.service.ts` | `.claude/rules/prisma.md` |

A file can match more than one rule. Check all.

### Step 5 — Commit

Only after Steps 1–4 are clean:

```bash
git add <specific files>          # never `git add -A`/`git add .`
git commit -m "<conventional message>"
git status                        # verify the commit landed
```

Commit message style follows the existing repo log (`feat(scope): …`, `fix(scope): …`, `docs(scope): …`, `chore(scope): …`, `test(scope): …`).

## Quick reference

```bash
# Full local pre-commit sweep, in order:
npm run prisma:generate          # only if schema.prisma changed
npm run typecheck
npm run lint
npm test
docker compose up -d && npm run test:e2e
# Then: re-read matching .claude/rules/*.md → update if stale
```

## Common mistakes

| Mistake | Fix |
|---|---|
| Running only `npm test` on a `src/bets` change | Bets are e2e-critical (concurrency, locks). Also run `npm run test:e2e`. |
| `git add -A` after a long session | Stages unrelated artifacts (`coverage/`, scratch files). Add by name. |
| Editing `prisma/schema.prisma` without `prisma:generate` | `npm run typecheck` will lie because the client types are stale. |
| Updating `src/bets/bets.service.ts` but not `.claude/rules/bets.md` when adding a new lock or invariant | The rule now misleads future agents. Update both. |
| Adding a new env var to `EnvSchema` without updating `.env.example` and `.github/workflows/ci.yml` | CI will fail to boot; new contributors won't know to set it. |
| Adding a new HTTP error shape | Update `.claude/rules/api.md` — the response shape is part of the public contract. |
| Treating `LOG_LEVEL=warn` e2e flakes as "transient" | Read the failure. The concurrency tests catch real bugs. |

## Red flags — STOP and re-run the checklist

- "I'll just commit the code now, the tests pass locally" — but you didn't run `test:e2e`.
- "The rule is close enough" — close enough means stale. Update it.
- "Schema is a one-line change, no migration needed" — every schema change needs a migration.
- "I'll fix typecheck after the commit" — no. Fix first.
- "I'll squash the rule update into the next commit" — no. Code and its rule move together.

## Why each step exists

- **Typecheck** catches Prisma-client type drift after schema changes and prevents BigInt/number confusion.
- **Lint** catches unused imports that snowball into circular-dependency bugs in Nest's DI graph.
- **Unit tests** pin pure-function contracts (engine determinism, payout math, password hashing).
- **E2E tests** catch the things unit tests can't: HTTP shape, transaction concurrency, validation pipe behavior, exception filter output.
- **Test coverage policy** prevents "stealth behavior changes" — a bug fix without a regression test will come back.
- **Rules freshness** keeps `.claude/rules/` trustworthy. The moment the rules drift from reality, agents will follow stale guidance and re-introduce old bugs.
