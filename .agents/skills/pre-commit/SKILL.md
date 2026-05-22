---
name: pre-commit
description: Use before every `git commit` in plinko-be to run typecheck/lint/related tests and verify that path-scoped rules in .Codex/rules/ are still accurate for the changed source files
---

# Pre-commit workflow

## Overview

Before committing, verify three things in this order:

1. **Mechanical checks pass** — typecheck, lint, related tests (`scripts/run-related-tests.sh`).
2. **Source ↔ test coverage** — every changed source file under `src/` has a matching test change, or an explicit waiver (`scripts/check-test-coverage.sh`).
3. **Doc/rule freshness** — every rule, skill, and mapped doc still describes truth for the changed files (`scripts/check-doc-freshness.sh`, which also invokes `scripts/audit-docs.mjs`).

The scripts are the source of truth: their output is what blocks or releases a commit. The prose below explains **how to act on a failure**, not what to remember in your head.

## When to use

- Use before any `git commit` that touches `src/`, `test/`, `prisma/`, `Dockerfile`, `fly.toml`, `.github/workflows/`, or `.Codex/`.
- Skip only for pure markdown changes outside `.Codex/rules/` (e.g. `README.md`, `docs/` not under `.Codex/`).
- This skill is the manual version of the future `.Codex/hooks/pre-commit-gate.sh` (planned in Фаза 7 of [docs/superpowers/plans/2026-05-19-ai-workflow.md](../../../docs/superpowers/plans/2026-05-19-ai-workflow.md)). The validation scripts already exist (Фаза 5); the Codex `PreToolUse` gate that enforces them automatically does not. Until the hook lands, you run them by hand.

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
- **rules/skills:** `.Codex/rules/**`, `.Codex/skills/**`, `AGENTS.md`

### Step 2 — Mechanical checks

Run in this order, fix-and-rerun on failure:

```bash
# Schema-first: regenerate Prisma client before typecheck if schema changed
npm run prisma:generate          # only if prisma/schema.prisma is in the diff

npm run typecheck                # tsc --noEmit
npm run lint                     # eslint --fix

# Diff-aware test runner: chooses the minimum suite based on staged files.
# - global trigger (package.json, jest configs, tsconfig, nest-cli, schema, migrations) → full `npm test`
# - changed src/test TS files → `npm test -- --findRelatedTests <files>`
# - changed test/e2e/*.e2e-spec.ts → `npm run test:e2e` (needs Postgres up)
./scripts/run-related-tests.sh staged
```

If `run-related-tests.sh` decides to run e2e and Postgres isn't up:

```bash
docker compose up -d
./scripts/run-related-tests.sh staged
```

### Step 3 — Source ↔ test coverage policy

```bash
./scripts/check-test-coverage.sh main
```

This blocks the commit if any of the following changed without a matching `*.spec.ts` or `test/e2e/**/*.ts` change:

- `src/**/*.ts` (non-spec)
- `prisma/schema.prisma`
- `prisma/migrations/**/*.sql`

If the script fails, choose one:

- Add a unit `*.spec.ts` next to the changed source.
- Add an e2e in `test/e2e/` (use the per-subsystem mapping below to pick the right file).
- Write an **explicit waiver** in the commit body explaining why no test was added (`Refactor: no behavior change`, `Comment-only`, `Generated code`). Don't silently skip.

Per-subsystem hint when you do add a test:

| Changed file class | Preferred test |
|---|---|
| `src/bets/**`, `src/wallet/**`, `src/game/**` (non-spec) | Unit `*.spec.ts` next to it OR `test/e2e/bets*.e2e-spec.ts` |
| `src/auth/**`, `src/users/**` (non-spec) | Unit `*.spec.ts` next to it OR `test/e2e/auth*.e2e-spec.ts` |
| `src/seeds/**` (non-spec) | Unit `*.spec.ts` next to it OR `test/e2e/seeds*.e2e-spec.ts` |
| `src/common/**` (filter/interceptor) | Unit `*.spec.ts` or an e2e that exercises it |
| `prisma/schema.prisma` or new migration | At least one e2e exercising the new field/constraint |

### Step 4 — Doc / rule freshness

```bash
./scripts/check-doc-freshness.sh main
```

This script:

1. Verifies every path in [.Codex/doc-mappings.json](../../doc-mappings.json) exists (mapping integrity).
2. Verifies every `.Codex/rules/*.md` has a block-style `paths:` YAML frontmatter whose static prefixes resolve to real directories.
3. Warns if `AGENTS.md` grows past 300 lines (subsystem detail belongs in `.Codex/rules/`, not the entrypoint).
4. For every changed file vs base, prints the docs/skills/rules the agent must **re-read** before committing. Files under `docs/superpowers/{plans,specs}/` are warnings, not blockers (durable project history).
5. Runs `node scripts/audit-docs.mjs --check` — backtick paths that don't exist, PascalCase Service/Controller/Module/etc. identifiers not present anywhere in `src/`, honouring `auditIgnore` from the mapping file.

When the script prints a "re-read" list for a changed file, **actually open each listed doc/skill/rule** and ask:

- Does any invariant the rule states still hold after my change?
- Does any code snippet / file path in the rule still resolve?
- Did I introduce a NEW invariant, response shape, lock, env var, or constraint that the rule should mention?
- Did I change a public surface (controller/DTO) that the module doc in [docs/modules/](../../../docs/modules/) describes?

If a doc/skill/rule is stale → update it in the **same commit** (or in a preceding one). Never commit a code change that contradicts a tracked rule without updating the rule.

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
npm run prisma:generate                         # only if schema.prisma changed
npm run typecheck
npm run lint
./scripts/run-related-tests.sh staged           # auto-picks unit / e2e / full suite
./scripts/check-test-coverage.sh main           # blocks src-only changes without a test
./scripts/check-doc-freshness.sh main           # mapping + rule + audit-docs in one shot
# Then: actually re-read the docs/skills/rules the freshness script flagged.
```

## Common mistakes

| Mistake | Fix |
|---|---|
| Running `npm test` directly instead of `./scripts/run-related-tests.sh staged` | The script also triggers `npm run test:e2e` when an e2e spec changed; bare `npm test` skips e2e silently. |
| Skipping `check-test-coverage.sh` on a "small" src change | The script is the gate. If you really need to skip it, write the waiver in the commit body. |
| `git add -A` after a long session | Stages unrelated artifacts (`coverage/`, scratch files, `.Codex/.precommit-skill-ran`). Add by name. |
| Editing `prisma/schema.prisma` without `prisma:generate` | `npm run typecheck` will lie because the client types are stale. |
| Updating `src/bets/bets.service.ts` but not `.Codex/rules/bets.md` when adding a new lock or invariant | The rule now misleads future agents. `check-doc-freshness.sh` flags the file; you still have to update the rule. |
| Adding a new env var to `EnvSchema` without updating `.env.example` and `.github/workflows/ci.yml` | CI will fail to boot; new contributors won't know to set it. |
| Adding a new HTTP error shape | Update `.Codex/rules/api.md` — the response shape is part of the public contract. |
| Treating `LOG_LEVEL=warn` e2e flakes as "transient" | Read the failure. The concurrency tests catch real bugs. |
| `audit-docs` warns about a planned-but-missing path | Either land the path now or add it to `auditIgnore` in `.Codex/doc-mappings.json` with a comment. Don't paper over real drift. |

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
- **Rules freshness** keeps `.Codex/rules/` trustworthy. The moment the rules drift from reality, agents will follow stale guidance and re-introduce old bugs.
