---
name: deploy-flow
description: Use when deploying plinko-be to Fly.io — covers pre-deploy verification, migration safety, secrets/env, the deploy command itself, and post-deploy health checks
---

# Deploy flow (Fly.io)

## Overview

`plinko-be` deploys to Fly.io as a single app (`plinko-be-stanish`, region `fra`). There are two deploy paths:

1. **Automatic:** push to `main` → GitHub Actions runs CI → on green, runs `flyctl deploy --remote-only` ([.github/workflows/ci.yml](../../../.github/workflows/ci.yml)).
2. **Manual:** `flyctl deploy` from a developer machine (rare — use only for hotfixes when CI is broken).

Migrations run on every deploy via the `release_command` in [fly.toml](../../../fly.toml): `npx prisma migrate deploy`. A failed migration aborts the release before the new image takes traffic.

## When to use

- Before any push to `main` that should go to production.
- Before any manual `flyctl deploy`.
- After a Fly secret / env change, to verify the app still boots.
- When investigating "why is prod different from staging?" — the checklist surfaces drift.

## Pre-deploy checklist

Run [pre-commit](../pre-commit/SKILL.md) first. Then:

### 1. Verify the build artifact will be correct

```bash
git status --short                 # must be clean
git log --oneline -n 5             # confirm what's actually deploying
npm run build                      # nest build → dist/
ls dist/main.js                    # must exist
```

### 2. Verify migrations are safe

```bash
ls prisma/migrations/
git diff origin/main -- prisma/migrations/
```

Migration safety questions (answer all before deploying):

- Is every migration in `prisma/migrations/` already committed and pushed?
- Does any new migration add a `NOT NULL` column to a non-empty table? → It must include a backfill or a default. Otherwise the release aborts mid-deploy.
- Does any migration `DROP` a column / table / index still referenced by the **current** running code? → You're doing a destructive migration ahead of code rollout. Split into two deploys: (a) remove code references, deploy. (b) drop column, deploy.
- Does it touch `Bet`, `Seed`, `User`, or `RefreshToken` indexes? → Cross-check against [.claude/rules/prisma.md](../../rules/prisma.md) — the listed indexes are load-bearing.
- Did you test the migration locally? `npm run prisma:migrate` against `docker compose` Postgres reproduces the prod migration runner.

### 3. Verify secrets and env

Fly secrets are the source of truth in prod (NOT `.env`, NOT `fly.toml [env]`).

```bash
flyctl secrets list -a plinko-be-stanish
```

Required set (must all be present):

| Secret | Source / how to (re)set |
|---|---|
| `DATABASE_URL` | Attached automatically by `flyctl postgres attach <pg-app>`. Don't set by hand. |
| `JWT_ACCESS_SECRET` | `flyctl secrets set JWT_ACCESS_SECRET=$(openssl rand -hex 32)` |
| `JWT_REFRESH_SECRET` | `flyctl secrets set JWT_REFRESH_SECRET=$(openssl rand -hex 32)` |
| `JWT_ACCESS_TTL` | e.g. `15m` |
| `JWT_REFRESH_TTL` | e.g. `7d` |
| `MIN_BET` | bigint string, e.g. `1000000` |
| `MAX_BET` | bigint string, e.g. `1000000000000` |

If you added a new field to `EnvSchema` ([src/config/env.validation.ts](../../../src/config/env.validation.ts)) in this release, **set the Fly secret BEFORE deploying**. Otherwise the new machine will crash on boot, the health check fails, and Fly will roll back — but only after a 1-2 minute outage.

`fly.toml [env]` already provides `NODE_ENV=production` and `PORT=3000`. Do not duplicate those as secrets.

### 4. Verify deploy infrastructure

```bash
flyctl version
flyctl auth whoami
flyctl status -a plinko-be-stanish
docker build -t plinko-be:local .  # optional: catch Dockerfile bugs locally
```

If `flyctl status` shows machines in a degraded state, **fix that first**. A new deploy on top of a broken machine compounds the incident.

## Deploy

### Auto path (preferred)

```bash
git push origin main
# Then watch CI:
gh run watch --exit-status
# CI green → Fly action runs flyctl deploy --remote-only automatically
flyctl logs -a plinko-be-stanish   # tail release_command + boot logs
```

### Manual path (hotfix only)

```bash
flyctl deploy --remote-only -a plinko-be-stanish
```

`--remote-only` builds on Fly's builder, not your laptop — matches CI behavior and avoids "works on my machine" image drift. Only drop the flag if Fly's remote builder is down.

If you see `Error: release_command failed`, the migration aborted. The new image was **not** released to users. Diagnose with `flyctl logs` and either fix the migration or `flyctl releases rollback <previous-version>`.

## Post-deploy verification

```bash
# 1. Health endpoint is the same one Fly polls every 15s
curl -fsS https://plinko-be-stanish.fly.dev/health
# expected: 200 OK

# 2. Swagger reflects the deployed code
curl -fsS https://plinko-be-stanish.fly.dev/docs-json | jq '.info.version, (.paths | keys | length)'

# 3. Smoke a real flow against prod (cheap — no money moves on a fresh user)
EMAIL="smoke-$(date +%s)@test.local"
curl -fsS -X POST https://plinko-be-stanish.fly.dev/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d "{\"email\":\"$EMAIL\",\"password\":\"hunter22hunter22\"}" | jq

# 4. Logs are clean
flyctl logs -a plinko-be-stanish | head -50
# Look for: no `ERROR`, no `Env validation failed`, no Prisma migration errors,
# `Nest application successfully started`
```

If any of these fail → **rollback immediately**:

```bash
flyctl releases -a plinko-be-stanish
flyctl releases rollback <version-before-the-bad-one> -a plinko-be-stanish
```

…then investigate offline. Don't try to forward-fix a bleeding production.

## Quick reference

```bash
# Pre-deploy
git status && git log --oneline -n 5
npm run build
flyctl secrets list -a plinko-be-stanish
flyctl status -a plinko-be-stanish

# Deploy (auto)
git push origin main && gh run watch

# Deploy (manual hotfix)
flyctl deploy --remote-only -a plinko-be-stanish

# Verify
curl -fsS https://plinko-be-stanish.fly.dev/health
flyctl logs -a plinko-be-stanish

# Panic
flyctl releases rollback <prev-version> -a plinko-be-stanish
```

## Common mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Setting `DATABASE_URL` manually via `flyctl secrets set` | Overrides the attach-managed value; loses pooling config | Re-attach with `flyctl postgres attach` |
| Editing an already-applied migration file | Hash mismatch → `prisma migrate deploy` refuses to run | Revert the edit; write a new migration instead |
| Deploying a NOT NULL column + backfill in one migration without a `DEFAULT` | Release aborts, no traffic served | Split into 3 migrations: add nullable → backfill → set NOT NULL |
| Forgetting to set a new env var as Fly secret | App crashes on boot, health checks fail | Set the secret first, then deploy |
| `flyctl deploy` from a dirty working tree | Deploys uncommitted local code; CI history doesn't reflect prod | Commit + push first; let CI deploy |
| Skipping `npm run test:e2e` before push | Concurrency/transaction bugs reach prod | Run e2e locally; CI also runs them but you'll find out earlier |
| Bumping `JWT_ACCESS_SECRET` without coordination | Every active session is invalidated | Communicate the rotation; pair with a `JWT_REFRESH_SECRET` rotation only when planned |
| Treating Fly logs that say "Migration applied" as "deploy succeeded" | Migration succeeded but the new image might still crash on boot | Always also check `/health` returns 200 |

## Red flags — STOP

- CI failed but "the failure is unrelated" → no manual deploy. Fix CI first.
- A migration that's hard to reverse → write the rollback migration in the same PR, even if you don't apply it.
- `flyctl status` shows a machine restart loop → don't push more code on top.
- "I'll just `flyctl deploy` to test something" → no. Manual deploys are for hotfixes. For experiments, use a separate Fly app.
- You don't know which version is currently in prod → `flyctl releases` before doing anything else.

## Related

- Pre-commit checks: [.claude/skills/pre-commit/SKILL.md](../pre-commit/SKILL.md) — must be clean before a deploy.
- Schema/migration invariants: [.claude/rules/prisma.md](../../rules/prisma.md)
- Env validation: [src/config/env.validation.ts](../../../src/config/env.validation.ts) — the truth about which env vars are required.
- CI workflow: [.github/workflows/ci.yml](../../../.github/workflows/ci.yml) — what the auto path actually runs.
