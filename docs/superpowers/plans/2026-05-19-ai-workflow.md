# План створення AI Workflow з нуля

> **Для агентних виконавців:** ОБОВ'ЯЗКОВИЙ ПІДНАВИК: використай `superpowers:subagent-driven-development` (рекомендовано) або `superpowers:executing-plans`, щоб виконувати цей план по задачах. Кроки мають checkbox-формат (`- [ ]`) для відстеження прогресу.

**Мета:** створити з нуля повний AI workflow для цього NestJS backend-проєкту, щоб агенти мали єдині правила роботи, перевірки, документацію, git hooks і CI gates.

**Архітектура:** будуємо workflow як локальну систему правил для `plinko-be`: кореневі інструкції для агентів, path-scoped rules, task-invoked skills, source-to-doc mapping, diff-aware validation scripts, git hooks і CI gates. Усі рішення мають виходити з поточної структури цього репозиторію: npm, Jest, NestJS, Prisma, PostgreSQL, Docker, Fly.io.

**Технології:** Node.js 20, npm, TypeScript, NestJS 10, Prisma 5, PostgreSQL 16, Jest, Supertest, Bash, Node scripts, Claude/Codex agent docs, `simple-git-hooks`, `lint-staged`, `commitlint`.

## Як користуватись цим планом

Кожну фазу нижче можна виконувати окремим промптом до агента. Рекомендований режим:

1. Дай агенту промпт з поточної фази.
2. Дочекайся змін.
3. Попроси агента показати `git status --short` і список змінених файлів.
4. Попроси агента запустити перевірки, вказані у фазі.
5. Коміть тільки після зеленої перевірки або після зрозумілого пояснення, чому певну перевірку неможливо запустити локально.

У промптах нижче збережені англійські назви файлів, команд, skills і npm-пакетів. Це нормально: вони є технічними ідентифікаторами.

---

## Який workflow треба побудувати

Створюємо повний workflow для агентної розробки в цьому backend-проєкті. Він має складатися з таких частин:

- `CLAUDE.md` — головні Claude-specific правила, команди, архітектурна мапа, test policy, commit protocol.
- `AGENTS.md` — коротка точка входу для будь-якого coding agent.
- `.claude/skills/pre-commit/SKILL.md` — обов'язковий pre-commit workflow.
- `.claude/skills/*/SKILL.md` — workflow-інструкції для конкретних задач.
- `.claude/rules/*.md` — path-scoped архітектурні правила з `paths:` frontmatter.
- `.claude/doc-mappings.json` — mapping source files до docs/skills/rules.
- `.claude/hooks/pre-commit-gate.sh` — Claude `PreToolUse` gate для `git commit`.
- `scripts/run-related-tests.sh` — запуск тестів, пов'язаних зі staged або push diff.
- `scripts/check-test-coverage.sh` — policy: source change має мати test change.
- `scripts/check-doc-freshness.sh` — перевірка актуальності docs/skills/rules відносно diff.
- `scripts/audit-docs.mjs` — аудит drift у agent docs.
- `package.json` hooks — `simple-git-hooks`, `lint-staged`, `commitlint`, pre-push validation.
- `.github/workflows/ci.yml` — typecheck, tests, build, docs audit, docs freshness, security audit.

У цьому проєкті зараз є `.claude/settings.local.json` і `docs/superpowers/*`, але немає повного tracked workflow: `CLAUDE.md`, `AGENTS.md`, `.claude/skills`, `.claude/rules`, mapping, validation scripts і hook wiring.

---

## Файли, які треба створити або змінити

```text
AGENTS.md
CLAUDE.md
README.md
package.json
package-lock.json
.github/workflows/ci.yml
.gitignore

.claude/
  doc-mappings.json
  settings.example.json
  hooks/
    pre-commit-gate.sh
  skills/
    pre-commit/SKILL.md
    lead-reviewer-check/SKILL.md
    backend-development/SKILL.md
    auth-development/SKILL.md
    bets-development/SKILL.md
    seeds-development/SKILL.md
    prisma-development/SKILL.md
    deploy-flow/SKILL.md
  rules/
    api.md
    auth.md
    bets.md
    seeds.md
    prisma.md

scripts/
  run-related-tests.sh
  check-test-coverage.sh
  check-doc-freshness.sh
  audit-docs.mjs
```

Відповідальність файлів:

- `AGENTS.md` — коротка cross-agent точка входу.
- `CLAUDE.md` — головна робоча пам'ять для Claude Code та агентів, які її читають.
- `.claude/skills/*` — повторювані workflow для задач.
- `.claude/rules/*` — архітектурні правила, які підтягуються за шляхами файлів.
- `.claude/doc-mappings.json` — єдине джерело правди для source-to-doc/skill/rule freshness.
- `scripts/*` — виконувані перевірки, які роблять policy реальною.
- `package.json` і CI — механічні gates, щоб workflow не залежав тільки від дисципліни агента.

---

## Фаза 0: Підготовка

**Ціль:** переконатися, що агент розуміє поточний репозиторій і не затирає локальні зміни.

**Файли:** поки не змінювати.

- [ ] **Крок 1: Дати агенту стартовий промпт**

Промпт:

```text
Ти працюєш у `/Users/stas/Desktop/plinko-be`. Нам треба створити AI workflow з нуля саме для цього репозиторію.

Спочатку тільки досліди контекст:
- покажи `git status --short` у `plinko-be`;
- знайди, які agent/workflow файли вже є в `plinko-be`: `CLAUDE.md`, `AGENTS.md`, `.claude/`, `scripts/`, package hooks, CI workflow;
- прочитай `package.json`, `README.md`, `.github/workflows/ci.yml`, `jest.config.ts`, `jest.e2e.config.ts`, `prisma/schema.prisma`;
- переглянь структуру `src/` і `test/e2e/`.

Нічого не редагуй. Поверни коротку мапу: що вже є, чого бракує, які subsystem треба покрити правилами й перевірками.
```

- [ ] **Крок 2: Очікуваний результат**

Агент має підтвердити:

- у `plinko-be` є `.claude/settings.local.json`, але немає tracked `.claude/skills`, `.claude/rules`, mapping і scripts;
- основні backend subsystem: `auth`, `users`, `wallet`, `game`, `seeds`, `bets`, `prisma`, `common`, `config`;
- доступні команди: `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`, Prisma scripts.

---

## Фаза 1: Додати базові agent docs

**Ціль:** створити `CLAUDE.md` і `AGENTS.md`, щоб будь-який агент починав з однакових правил.

**Файли:**

- Створити: `CLAUDE.md`
- Створити: `AGENTS.md`
- Змінити: `README.md`

- [ ] **Крок 1: Дати агенту промпт на створення docs**

Промпт:

```text
Створи базові agent docs для `plinko-be`.

Потрібні файли:
1. `CLAUDE.md`
2. `AGENTS.md`
3. оновлення `README.md` з секцією `Agent Workflow`

Побудуй docs з нуля на основі поточної структури `plinko-be`: `package.json`, `README.md`, `src/`, `test/e2e/`, `prisma/schema.prisma`, `.github/workflows/ci.yml` і фактичних npm scripts.

`CLAUDE.md` має бути українською і містити:
- source precedence: якщо docs не збігаються з code, довіряти code після перевірки через `rg` або read;
- commit protocol: перед commit, який торкається `src/`, `test/`, `prisma/`, `Dockerfile`, `fly.toml`, `.github/workflows/`, запускати `pre-commit` skill;
- project overview: NestJS + Prisma + Postgres backend для Plinko iGaming demo;
- команди: `npm install`, `docker compose up -d`, `npm run prisma:migrate`, `npm run start:dev`, `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build`;
- test requirements для `auth`, `bets`, `seeds`, `game`, `wallet`, `prisma`;
- architecture map по папках `src/auth`, `src/users`, `src/wallet`, `src/game`, `src/seeds`, `src/bets`, `src/prisma`, `src/common`, `src/config`, `test/e2e`, `prisma/schema.prisma`;
- critical rules: BigInt як string у JSON, refresh token hashes only, active server seed не розкривати, bet placement транзакційний, nonce унікальний по `(seedId, nonce)`, ValidationPipe strict, e2e потребують Postgres.

`AGENTS.md` має бути коротким українським entrypoint:
- прочитати `CLAUDE.md`;
- список команд;
- required checks;
- source of truth policy.

У `README.md` додай секцію:
`## Agent Workflow`
з посиланнями на `AGENTS.md`, `CLAUDE.md`, `.claude/skills/`, `.claude/rules/`, `.claude/doc-mappings.json`.

Після змін запусти:
`npx prettier --write CLAUDE.md AGENTS.md README.md`

Не коміть. Покажи `git status --short` і короткий summary.
```

- [ ] **Крок 2: Перевірити результат**

Команди:

```bash
sed -n '1,220p' CLAUDE.md
sed -n '1,180p' AGENTS.md
rg -n "Agent Workflow|CLAUDE.md|AGENTS.md|doc-mappings" README.md
npx prettier --check CLAUDE.md AGENTS.md README.md
```

Очікувано:

- `CLAUDE.md` і `AGENTS.md` існують.
- Немає згадок `pnpm`, `Vitest`, `packages/core` або сторонніх проектних артефактів.
- Prettier проходить.

- [ ] **Крок 3: Коміт фази**

Команди:

```bash
git add CLAUDE.md AGENTS.md README.md
git commit -m "docs: add agent workflow entrypoints"
```

---

## Фаза 2: Додати path-scoped rules

**Ціль:** винести довгі subsystem правила з `CLAUDE.md` у `.claude/rules/*`, щоб агент отримував релевантний контекст під час роботи з конкретними шляхами.

**Файли:**

- Створити: `.claude/rules/api.md`
- Створити: `.claude/rules/auth.md`
- Створити: `.claude/rules/bets.md`
- Створити: `.claude/rules/seeds.md`
- Створити: `.claude/rules/prisma.md`

- [ ] **Крок 1: Дати агенту промпт**

Промпт:

```text
Створи path-scoped rules для `plinko-be` у `.claude/rules/`.

Потрібні файли:
- `.claude/rules/api.md`
- `.claude/rules/auth.md`
- `.claude/rules/bets.md`
- `.claude/rules/seeds.md`
- `.claude/rules/prisma.md`

Кожен файл має:
- YAML frontmatter з block-style `paths:`;
- український опис відповідного subsystem;
- конкретні invariants;
- посилання на релевантні source/test файли.

Правила:
1. `api.md` paths:
   - `src/**/*.controller.ts`
   - `src/**/*.dto.ts`
   - `src/common/**/*.ts`
   - `src/main.ts`
   - `test/e2e/**/*.ts`
   Invariants: `/api/v1`, `GET /health` без prefix, Swagger `/docs`, strict `ValidationPipe`, BigInt serialization, consistent errors.

2. `auth.md` paths:
   - `src/auth/**/*.ts`
   - `src/users/**/*.ts`
   - `test/e2e/auth.e2e-spec.ts`
   Invariants: refresh token тільки hash, не повертати secrets/hashes, окремі JWT secrets, registration lifecycle.

3. `bets.md` paths:
   - `src/bets/**/*.ts`
   - `src/wallet/**/*.ts`
   - `src/game/**/*.ts`
   - `test/e2e/bets*.e2e-spec.ts`
   Invariants: транзакційність, concurrency, BigInt money, Decimal multiplier, persisted balance equals response balance.

4. `seeds.md` paths:
   - `src/seeds/**/*.ts`
   - `src/game/engine.ts`
   - `src/game/engine.spec.ts`
   - `test/e2e/seeds.e2e-spec.ts`
   Invariants: active seed не розкриває `serverSeed`, reveal тільки після rotation/reveal, client seed не змінює минулі bets, nonce lifecycle.

5. `prisma.md` paths:
   - `prisma/schema.prisma`
   - `prisma/migrations/**/*.sql`
   - `src/prisma/**/*.ts`
   - `src/**/*.service.ts`
   Invariants: не редагувати applied migrations без disposable DB, schema changes потребують migration, зберігати `@@unique([seedId, nonce])` або сильніший replacement, review SQL.

Після створення запусти:
`npx prettier --write .claude/rules/*.md`
і покажи `git status --short`.

Не коміть.
```

- [ ] **Крок 2: Перевірити rules**

Команди:

```bash
for f in .claude/rules/*.md; do sed -n '1,80p' "$f"; done
npx prettier --check .claude/rules/*.md
```

Очікувано:

- У кожному файлі є `---`, `paths:`, список `  - '...'`.
- Немає inline YAML виду `paths: [a, b]`.
- Усі шляхи відповідають цьому репозиторію.

- [ ] **Крок 3: Коміт фази**

```bash
git add .claude/rules
git commit -m "docs: add backend workflow rules"
```

---

## Фаза 3: Додати task skills

**Ціль:** створити workflow-інструкції, які агент має використовувати для повторюваних задач: backend changes, auth, bets, seeds, Prisma, deploy, pre-commit, review.

**Файли:**

- Створити: `.claude/skills/backend-development/SKILL.md`
- Створити: `.claude/skills/auth-development/SKILL.md`
- Створити: `.claude/skills/bets-development/SKILL.md`
- Створити: `.claude/skills/seeds-development/SKILL.md`
- Створити: `.claude/skills/prisma-development/SKILL.md`
- Створити: `.claude/skills/deploy-flow/SKILL.md`
- Створити: `.claude/skills/lead-reviewer-check/SKILL.md`
- Створити: `.claude/skills/pre-commit/SKILL.md`

- [ ] **Крок 1: Дати агенту промпт**

Промпт:

```text
Створи task skills для AI workflow у `.claude/skills/`.

Формат кожного skill:
- YAML frontmatter:
  ---
  name: <skill-name>
  description: <коли використовувати>
  ---
- український markdown з workflow, обов'язковими документами, required checks і critical rules.

Потрібні skills:

1. `backend-development`
   Файл: `.claude/skills/backend-development/SKILL.md`
   Використання: зміни NestJS modules/controllers/services/DTO/common API behavior.
   Checks: `npm run typecheck`, smallest relevant test, `npm test`, `npm run test:e2e` для endpoint/Prisma/auth/seeds/bets/transactions.

2. `auth-development`
   Файл: `.claude/skills/auth-development/SKILL.md`
   Обов'язкові документи: `CLAUDE.md`, `.claude/rules/auth.md`, `.claude/rules/api.md`.
   Checks: `npm test -- src/auth`, `npm run test:e2e -- auth.e2e-spec.ts`, `npm run typecheck`.
   Rules: no secrets/hashes in response, refresh token hash only, separate JWT secrets.

3. `bets-development`
   Файл: `.claude/skills/bets-development/SKILL.md`
   Обов'язкові документи: `CLAUDE.md`, `.claude/rules/bets.md`, `.claude/rules/seeds.md`, `.claude/rules/prisma.md`.
   Checks: `npm test -- src/game src/wallet src/bets`, `npm run test:e2e -- bets.e2e-spec.ts`, `npm run test:e2e -- bets-concurrent.e2e-spec.ts`, `npm run typecheck`.
   Rules: transactional balance/nonce, BigInt money, concurrency coverage.

4. `seeds-development`
   Файл: `.claude/skills/seeds-development/SKILL.md`
   Обов'язкові документи: `CLAUDE.md`, `.claude/rules/seeds.md`, `.claude/rules/bets.md`.
   Checks: `npm test -- src/seeds src/game`, `npm run test:e2e -- seeds.e2e-spec.ts`, `npm run typecheck`.
   Rules: active server seed не reveal, deterministic output regression, one nonce per accepted bet.

5. `prisma-development`
   Файл: `.claude/skills/prisma-development/SKILL.md`
   Обов'язкові документи: `CLAUDE.md`, `.claude/rules/prisma.md`.
   Checks: `npx prisma validate`, `npm run prisma:generate`, `npm run typecheck`, `npm run test:e2e`.
   Rules: review generated SQL, не послаблювати indexes/constraints без replacement, runtime schema changes need e2e.

6. `deploy-flow`
   Файл: `.claude/skills/deploy-flow/SKILL.md`
   Використання: Dockerfile, fly.toml, CI deploy, Prisma deploy migrations.
   Checks: `npm run build`, `docker build -t plinko-be:local .`, `npm run prisma:deploy` тільки після review migrations.
   Rules: no secrets committed, README deploy docs aligned with `fly.toml`.

7. `lead-reviewer-check`
   Файл: `.claude/skills/lead-reviewer-check/SKILL.md`
   Це manual adversarial review перед commit/PR.
   Checklist: claims match code, API через controller/e2e path, transactions safe, secrets not exposed, BigInt/Decimal safe, migrations reviewed, docs/skills/rules updated.

8. `pre-commit`
   Файл: `.claude/skills/pre-commit/SKILL.md`
   Steps:
   - staged source coverage: staged `src/` або `prisma/` мають staged `*.spec.ts` або `test/e2e/*.ts`, якщо це не docs/comments-only;
   - run lead reviewer check;
   - `npm run typecheck`;
   - `./scripts/run-related-tests.sh staged`;
   - `npm run build`;
   - `./scripts/check-doc-freshness.sh main`;
   - `node scripts/audit-docs.mjs --check`;
   - `npm run test:e2e` якщо diff торкається `src/auth/`, `src/bets/`, `src/seeds/`, `src/prisma/`, `prisma/`, `src/main.ts`, `src/app.module.ts`;
   - якщо все пройшло, записати marker:
     `HASH=$(git diff --cached | shasum -a 256 | awk '{print $1}')`
     `echo "${HASH}:$(date +%s)" > .claude/.precommit-skill-ran`

Після створення запусти:
`npx prettier --write .claude/skills/*/SKILL.md`

Не коміть. Покажи `git status --short`.
```

- [ ] **Крок 2: Перевірити skills**

Команди:

```bash
for f in .claude/skills/*/SKILL.md; do sed -n '1,80p' "$f"; done
npx prettier --check .claude/skills/*/SKILL.md
```

Очікувано:

- Кожен skill має `name` і `description`.
- Немає згадок `packages/core`, `pnpm`, `Vitest` або сторонніх проектних артефактів.
- `pre-commit` skill містить marker command.

- [ ] **Крок 3: Коміт фази**

```bash
git add .claude/skills
git commit -m "docs: add backend workflow skills"
```

---

## Фаза 4: Додати `.claude/doc-mappings.json`

**Ціль:** навчити workflow розуміти, які docs/skills/rules мають оновлюватися при зміні конкретних source files.

**Файли:**

- Створити: `.claude/doc-mappings.json`

- [ ] **Крок 1: Дати агенту промпт**

Промпт:

```text
Створи `.claude/doc-mappings.json` для `plinko-be`.

Створи структуру самостійно під цей backend. Використовуй тільки поточні source paths, docs, skills і rules, які описані нижче.

Файл має містити:
- `_description`;
- `docs`;
- `skills`;
- `rules`;
- `introOnlyDocs`;
- `auditIgnore`.

Мінімальні mappings:

Docs:
- `src/auth/` -> `docs/superpowers/specs/2026-05-17-plinko-backend-design.md`
- `src/users/` -> `docs/superpowers/specs/2026-05-17-plinko-backend-design.md`
- `src/bets/` -> `docs/superpowers/specs/2026-05-17-plinko-backend-design.md`
- `src/wallet/` -> `docs/superpowers/specs/2026-05-17-plinko-backend-design.md`
- `src/seeds/` -> `docs/superpowers/specs/2026-05-17-plinko-backend-design.md`
- `src/game/` -> `docs/superpowers/specs/2026-05-17-plinko-backend-design.md`
- `src/common/` -> `README.md`
- `src/config/` -> `README.md`
- `src/prisma/` -> `README.md`
- `prisma/schema.prisma` -> `docs/superpowers/specs/2026-05-17-plinko-backend-design.md`
- `Dockerfile` -> `README.md`
- `fly.toml` -> `README.md`
- `.github/workflows/ci.yml` -> `README.md`

Skills:
- `src/` -> `.claude/skills/backend-development/SKILL.md`
- `src/auth/` and `src/users/` -> `.claude/skills/auth-development/SKILL.md`
- `src/bets/`, `src/wallet/`, `src/game/` -> `.claude/skills/bets-development/SKILL.md`
- `src/seeds/` -> `.claude/skills/seeds-development/SKILL.md`
- `src/prisma/`, `prisma/` -> `.claude/skills/prisma-development/SKILL.md`
- `Dockerfile`, `fly.toml` -> `.claude/skills/deploy-flow/SKILL.md`

Rules:
- controller/dto/common/main/e2e paths -> `.claude/rules/api.md`
- `src/auth/`, `src/users/` -> `.claude/rules/auth.md`
- `src/bets/`, `src/wallet/`, `src/game/` -> `.claude/rules/bets.md`
- `src/seeds/` -> `.claude/rules/seeds.md`
- `src/prisma/`, `prisma/` -> `.claude/rules/prisma.md`

`introOnlyDocs` має включити:
- `docs/superpowers/specs/2026-05-18-plinko-frontend-requirements.md`

`auditIgnore` має включити:
- `.env`
- `.env.example`
- `.claude/settings.local.json`
- `dist/`

Після створення запусти:
`node -e "JSON.parse(require('fs').readFileSync('.claude/doc-mappings.json','utf8')); console.log('doc-mappings ok')"`
і `npx prettier --write .claude/doc-mappings.json`.

Не коміть. Покажи `git status --short`.
```

- [ ] **Крок 2: Перевірити JSON**

Команди:

```bash
node -e "JSON.parse(require('fs').readFileSync('.claude/doc-mappings.json','utf8')); console.log('doc-mappings ok')"
npx prettier --check .claude/doc-mappings.json
```

Очікувано:

```text
doc-mappings ok
```

- [ ] **Крок 3: Коміт фази**

```bash
git add .claude/doc-mappings.json
git commit -m "docs: map source to agent workflow docs"
```

---

## Фаза 5: Додати validation scripts

**Ціль:** перетворити policy з документації у виконувані перевірки.

**Файли:**

- Створити: `scripts/run-related-tests.sh`
- Створити: `scripts/check-test-coverage.sh`
- Створити: `scripts/check-doc-freshness.sh`
- Створити: `scripts/audit-docs.mjs`
- Змінити: `.gitignore`

- [ ] **Крок 1: Дати агенту промпт на test scripts**

Промпт:

```text
Додай diff-aware test scripts для `plinko-be`.

Створи:
1. `scripts/run-related-tests.sh`
2. `scripts/check-test-coverage.sh`

Напиши scripts з нуля під Jest/npm. Логіка має бути такою:

`run-related-tests.sh`:
- `staged`: бере `git diff --cached --name-only --diff-filter=ACMR`;
- `push [base-ref]`: default `origin/main`, fallback `HEAD~1`;
- якщо змінився global trigger (`package.json`, `package-lock.json`, `jest.config.ts`, `jest.e2e.config.ts`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `prisma/schema.prisma`, `prisma/migrations/`) -> запускає `npm test`;
- для `src|test` TS/JS files запускає:
  - unit related: `npm test -- --findRelatedTests <files>`;
  - якщо змінені `test/e2e/*.e2e-spec.ts`, запускає `npm run test:e2e`;
- якщо немає релевантних файлів, виходить з code 0.

`check-test-coverage.sh`:
- default base `main`;
- якщо змінені `src/**/*.ts` або `prisma/schema.prisma` або `prisma/migrations/*.sql`, має бути змінений хоча б один `*.spec.ts` або `test/e2e/*.ts`;
- якщо тестів немає, exit 1 і вивести список source files.

Також додай у `.gitignore`:
`.claude/.precommit-skill-ran`

Після створення:
- `chmod +x scripts/run-related-tests.sh scripts/check-test-coverage.sh`
- `npx prettier --write .gitignore`

Не коміть. Покажи `git status --short`.
```

- [ ] **Крок 2: Дати агенту промпт на docs scripts**

Промпт:

```text
Додай documentation freshness scripts для `plinko-be`.

Створи:
1. `scripts/check-doc-freshness.sh`
2. `scripts/audit-docs.mjs`

Напиши scripts з нуля під цю структуру repo. Вимоги:

`check-doc-freshness.sh`:
- default base branch `main`;
- mapping file `.claude/doc-mappings.json`;
- rule dir `.claude/rules`;
- перевіряти mapping freshness для `docs`, `skills`, `rules`;
- перевіряти mapping integrity: source/doc/skill/rule paths існують;
- перевіряти rule path sanity для YAML `paths:`;
- перевіряти розмір `CLAUDE.md`;
- для `docs/superpowers/plans` і `docs/superpowers/specs` тільки warning, не hard block, бо цей repo вже використовує ці файли як project history;
- не додавати VitePress guide coverage logic, бо тут немає `packages/docs`;
- запускати `node scripts/audit-docs.mjs --check`, якщо Node доступний.

`audit-docs.mjs`:
- сканує `CLAUDE.md`, `.claude/rules/*.md`, `.claude/skills/**/SKILL.md`;
- шукає backtick-wrapped paths, які не існують;
- шукає PascalCase identifiers з suffix типу `Service`, `Controller`, `Module`, `Guard`, `Strategy`, `Filter`, `Interceptor`, `Dto`, `Response`, `Provider`, якщо вони не знаходяться у `src/`;
- використовує `auditIgnore` з `.claude/doc-mappings.json`;
- не робить plugin coverage check.

Після створення:
- `chmod +x scripts/check-doc-freshness.sh`
- `npx prettier --write scripts/audit-docs.mjs`

Не коміть. Покажи `git status --short`.
```

- [ ] **Крок 3: Перевірити scripts**

Команди:

```bash
./scripts/run-related-tests.sh staged
./scripts/check-test-coverage.sh main
./scripts/check-doc-freshness.sh main
node scripts/audit-docs.mjs --check
```

Очікувано:

- `run-related-tests.sh staged` не падає на чистому staged diff.
- `check-test-coverage.sh main` не падає без релевантного diff або коректно пояснює проблему.
- `check-doc-freshness.sh main` може попередити про існуючі `docs/superpowers/*`, але не має падати через це.
- `audit-docs.mjs --check` має пройти після виправлення реального drift.

- [ ] **Крок 4: Коміт фази**

```bash
git add scripts .gitignore
git commit -m "chore: add agent workflow validation scripts"
```

---

## Фаза 6: Підключити npm hooks

**Ціль:** зробити workflow частиною локального git процесу.

**Файли:**

- Змінити: `package.json`
- Змінити: `package-lock.json`

- [ ] **Крок 1: Дати агенту промпт**

Промпт:

```text
Підключи git hook tooling для `plinko-be`.

Потрібно:
1. Встановити devDependencies:
   `npm install --save-dev @commitlint/cli @commitlint/config-conventional lint-staged simple-git-hooks`

2. У `package.json` розділити lint:
   - `lint`: `eslint "{src,test}/**/*.ts"`
   - `lint:fix`: `eslint "{src,test}/**/*.ts" --fix`

3. Додати script:
   - `check-docs`: `./scripts/check-doc-freshness.sh`
   - `prepare`: `node -e "if(!process.env.CI)require('child_process').execSync('simple-git-hooks',{stdio:'inherit'})"`

4. Додати `simple-git-hooks`:
   - `pre-commit`: `npx lint-staged && npm run typecheck`
   - `commit-msg`: `npx commitlint --edit $1`
   - `pre-push`: `npm run typecheck && ./scripts/run-related-tests.sh push origin/main && npm run build && ./scripts/check-test-coverage.sh main`

5. Додати `commitlint`:
   - extends `@commitlint/config-conventional`

6. Додати `lint-staged`:
   - `*.{ts}` -> `eslint --fix`, `prettier --write`
   - `*.{json,md,yml,yaml}` -> `prettier --write`

Після змін запусти:
- `npm run prepare`
- `npm run typecheck`

Не коміть. Покажи `git status --short`.
```

- [ ] **Крок 2: Перевірити hooks**

Команди:

```bash
npm run prepare
ls .git/hooks
npm run typecheck
```

Очікувано:

- `.git/hooks/pre-commit`, `.git/hooks/commit-msg`, `.git/hooks/pre-push` існують.
- `npm run typecheck` проходить.

- [ ] **Крок 3: Коміт фази**

```bash
git add package.json package-lock.json
git commit -m "chore: add git workflow hooks"
```

---

## Фаза 7: Додати Claude commit gate

**Ціль:** зробити так, щоб Claude Code не міг легко зробити commit захищених змін без `pre-commit` skill marker.

**Файли:**

- Створити: `.claude/hooks/pre-commit-gate.sh`
- Створити: `.claude/settings.example.json`
- Локально змінити: `.claude/settings.local.json`

- [ ] **Крок 1: Дати агенту промпт**

Промпт:

```text
Додай Claude commit gate для `plinko-be`.

1. Напиши `.claude/hooks/pre-commit-gate.sh` з нуля. Він має читати Claude `PreToolUse` JSON зі `stdin`, знаходити Bash command і блокувати `git commit`, якщо є staged protected files, але marker `.claude/.precommit-skill-ran` відсутній, застарілий або не збігається з hash поточного staged diff.

2. Замінити protected staged file scope на:
   `^(src/|test/|prisma/|Dockerfile|fly\.toml|\.github/workflows/)`

3. У user-facing повідомленнях замінити `packages/core/src/` на:
   `src/, test/, prisma/, Dockerfile, fly.toml, or .github/workflows/`

4. Створи `.claude/settings.example.json`:
   - hook `PreToolUse`;
   - matcher `Bash`;
   - command `.claude/hooks/pre-commit-gate.sh`.

5. Обережно онови `.claude/settings.local.json`:
   - збережи існуючий `permissions.allow`;
   - додай `hooks.PreToolUse`;
   - не видаляй локальні permissions.

Після змін:
- `chmod +x .claude/hooks/pre-commit-gate.sh`
- `npx prettier --write .claude/settings.example.json .claude/settings.local.json`

Не коміть. Покажи `git status --short` і поясни, які локальні зміни в `.claude/settings.local.json` зроблені.
```

- [ ] **Крок 2: Перевірити gate script**

Команди:

```bash
sed -n '1,220p' .claude/hooks/pre-commit-gate.sh
sed -n '1,120p' .claude/settings.example.json
```

Очікувано:

- protected scope містить `src/|test/|prisma/|Dockerfile|fly.toml|.github/workflows`.
- marker path: `.claude/.precommit-skill-ran`.
- script порівнює hash `git diff --cached`.

- [ ] **Крок 3: Коміт tracked gate files**

Не комітити персональні локальні permission changes, якщо `.claude/settings.local.json` не має бути tracked.

```bash
git add .claude/hooks/pre-commit-gate.sh .claude/settings.example.json
git commit -m "chore: add Claude commit gate"
```

---

## Фаза 8: Оновити CI

**Ціль:** додати workflow перевірки до GitHub Actions.

**Файли:**

- Змінити: `.github/workflows/ci.yml`

- [ ] **Крок 1: Дати агенту промпт**

Промпт:

```text
Онови `.github/workflows/ci.yml`, щоб CI перевіряв AI workflow.

Збережи існуючий Postgres service і env block.

Після існуючих кроків:
- `npm run typecheck`
- `npm test`
- `npm run test:e2e`

додай:
- `npm run build`
- `node scripts/audit-docs.mjs --check`
- `./scripts/check-doc-freshness.sh main`
- `npm audit --audit-level=high`

Назви steps:
- Build
- Documentation audit
- Documentation freshness
- Security audit

Після змін запусти:
`npx prettier --write .github/workflows/ci.yml`

Не коміть. Покажи diff цього файлу.
```

- [ ] **Крок 2: Перевірити YAML**

Команди:

```bash
sed -n '1,220p' .github/workflows/ci.yml
npx prettier --check .github/workflows/ci.yml
```

Очікувано:

- CI все ще піднімає PostgreSQL.
- Є build, docs audit, docs freshness, security audit.

- [ ] **Крок 3: Коміт фази**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: enforce agent workflow checks"
```

---

## Фаза 9: Перший повний прогін workflow

**Ціль:** перевірити, що новий workflow реально працює в цьому репозиторії.

**Файли:** змінювати тільки якщо перевірки виявлять реальний drift.

- [ ] **Крок 1: Дати агенту промпт**

Промпт:

```text
Запусти перший повний прогін нового AI workflow.

Виконай:
1. `npm run typecheck`
2. `npm test`
3. `npm run build`
4. `node scripts/audit-docs.mjs --check`
5. `./scripts/check-doc-freshness.sh main`

Потім, якщо Docker/Postgres доступний:
6. `docker compose up -d`
7. `npm run prisma:deploy`
8. `npm run test:e2e`

Якщо якась перевірка падає:
- не приховуй;
- покажи точний failure;
- виправ тільки те, що належить до впровадження workflow;
- не рефактори unrelated source code.

Наприкінці дай:
- список команд;
- status кожної команди;
- `git status --short`;
- що лишилось зробити вручну.
```

- [ ] **Крок 2: Очікуваний результат**

Мінімально має пройти:

```bash
npm run typecheck
npm test
npm run build
node scripts/audit-docs.mjs --check
./scripts/check-doc-freshness.sh main
```

`check-doc-freshness.sh` може попереджати про існуючі:

- `docs/superpowers/plans/2026-05-17-plinko-backend.md`
- `docs/superpowers/specs/2026-05-17-plinko-backend-design.md`
- `docs/superpowers/specs/2026-05-18-plinko-frontend-requirements.md`

На першому етапі це warning, не hard block.

- [ ] **Крок 3: Фінальний коміт**

Перед commit агент має пройти `pre-commit` skill.

Промпт:

```text
Підготуй фінальний commit AI workflow.

Спочатку виконай workflow з `.claude/skills/pre-commit/SKILL.md`:
- перевір staged source coverage;
- manual lead reviewer check;
- `npm run typecheck`;
- `./scripts/run-related-tests.sh staged`;
- `npm run build`;
- `./scripts/check-doc-freshness.sh main`;
- `node scripts/audit-docs.mjs --check`;
- e2e якщо релевантно;
- якщо все пройшло, запиши `.claude/.precommit-skill-ran` marker.

Після цього покажи `git status --short`.
Якщо все чисто для commit, зроби:
`git commit -m "chore: install agentic workflow gates"`
```

---

## Політика для існуючих plans/specs

Не вводимо hard delete gate одразу. У цьому repo вже є історичні docs:

- `docs/superpowers/plans/2026-05-17-plinko-backend.md`
- `docs/superpowers/specs/2026-05-17-plinko-backend-design.md`
- `docs/superpowers/specs/2026-05-18-plinko-frontend-requirements.md`

Тому для першої ітерації:

1. Не вмикати hard delete gate.
2. Нехай `check-doc-freshness.sh` показує warning.
3. Після стабілізації workflow окремо вирішити, що робити з цими файлами:
   - залишити як durable project history;
   - перемістити в archive;
   - ввібрати важливу інформацію в `CLAUDE.md`, `.claude/rules/*`, `.claude/skills/*`, `README.md` і видалити.

Промпт для окремого рішення:

```text
Проаналізуй існуючі `docs/superpowers/plans/*` і `docs/superpowers/specs/*`.

Потрібно вирішити, що є durable project history, а що тимчасовий артефакт.

Не видаляй нічого одразу. Спочатку дай таблицю:
- файл;
- чи використовується зараз;
- яка інформація має бути перенесена в `CLAUDE.md`, `.claude/rules/*`, `.claude/skills/*` або `README.md`;
- рекомендація: keep, archive, absorb+delete.
```

---

## Acceptance Criteria

- `AGENTS.md` і `CLAUDE.md` існують та описують саме `plinko-be`.
- `.claude/skills/pre-commit/SKILL.md` описує обов'язковий validation path.
- Є domain skills для backend, auth, bets, seeds, Prisma, deploy, review.
- Є path-scoped rules для API, auth, bets, seeds, Prisma.
- `.claude/doc-mappings.json` мапить важливі source subtrees до docs, skills і rules.
- `scripts/run-related-tests.sh staged` працює.
- `scripts/run-related-tests.sh push origin/main` працює.
- `scripts/check-test-coverage.sh main` блокує source changes без tests.
- `scripts/check-doc-freshness.sh main` показує stale docs/skills/rules.
- `node scripts/audit-docs.mjs --check` проходить після виправлення drift.
- `simple-git-hooks` ставить `pre-commit`, `commit-msg`, `pre-push`.
- Commit messages проходять Conventional Commits.
- CI запускає typecheck, unit tests, e2e tests, build, docs audit, docs freshness, security audit.
- Локальний `.claude/settings.local.json` зберігає permissions і отримує Claude `PreToolUse` commit gate.

---

## Self-Review

- **Покриття вимог:** план описує створення AI workflow з нуля для `plinko-be` під npm/Jest/NestJS/Prisma.
- **Покрокові промпти:** кожна фаза має готовий prompt, який можна напряму дати агенту.
- **Ризик:** hard cleanup gate для `docs/superpowers/*` навмисно пом'якшений до warning, бо в цьому repo ці файли вже використовуються як історія проєкту.
- **Перевірка:** кожна фаза містить команди перевірки й очікуваний результат.
