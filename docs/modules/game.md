# Модуль `game`

> Інваріанти — у [.claude/rules/seeds.md](../../.claude/rules/seeds.md) (purity, determinism, payout-table shape) і [.claude/rules/bets.md](../../.claude/rules/bets.md) (як `play` викликається всередині bet-транзакції). Цей файл — структурна мапа.

## Призначення

`game` — це **pure** функціональне ядро Plinko: детермінований `play(serverSeed, clientSeed, nonce, rows, risk) → { path, bucketIndex, multiplier }` і таблиці виплат. Модуль не тримає стану, не звертається до БД, не імпортує Prisma. Уся stateful-обгортка (seed lifecycle, баланс, транзакція) живе в `bets` / `seeds` / `wallet`.

Окремо модуль виставляє один read-only HTTP endpoint, який повертає клієнту допустимі параметри гри та повну таблицю мультиплікаторів — щоб фронтенд міг рендерити preview виплат без секретів.

## Публічна поверхня (HTTP)

| Метод | Шлях | Guard | Відповідь |
|---|---|---|---|
| `GET` | `/api/v1/game/config` | — (публічний) | [`GameConfigResponse`](../../src/game/dto/game-config.response.ts) |

Реалізація: [src/game/config.controller.ts](../../src/game/config.controller.ts). Поля: `rows: number[]` (8..16), `risks: ['LOW','MEDIUM','HIGH']`, `minBet`, `maxBet` (обидва — `BigInt` → string через `BigIntInterceptor`), `payoutTables`.

Endpoint **навмисно** без auth — це конфіг для UI, нічого секретного не повертає.

## Експортовані будівельні блоки

`GameModule` ([src/game/game.module.ts](../../src/game/game.module.ts)) реєструє тільки контролер; жодних provider'ів не експортує. Решта модуля — pure файли, які `BetsService` імпортує напряму:

- [src/game/engine.ts](../../src/game/engine.ts) — `play(serverSeed, clientSeed, nonce, rows, risk): PlayResult`. HMAC-SHA256(serverSeed, `${clientSeed}:${nonce}`), перші `rows` байт → шлях `L`/`R` (`< 128` = L), `bucketIndex` = кількість `R`-ів, `multiplier = PAYOUT_TABLES[risk][rows][bucketIndex]`.
- [src/game/payout-tables.ts](../../src/game/payout-tables.ts) — константна таблиця `Record<Risk, Record<number, number[]>>`. Довжина рядка `rows` дорівнює `rows + 1`. Точність — до 4 знаків після коми (узгоджено з `Decimal(10,4)` у `Bet.multiplier` і scaling factor `10_000` у `WalletService`).
- [src/game/types.ts](../../src/game/types.ts) — `Risk = 'LOW' | 'MEDIUM' | 'HIGH'`, `RISKS`, `MIN_ROWS = 8`, `MAX_ROWS = 16`, інтерфейс `PlayResult`.

`BetsService` імпортує `play`, `MIN_ROWS`, `MAX_ROWS`, `Risk` напряму з цих файлів — не через `GameModule`. Це усвідомлено: `play` — це чиста функція, не Nest provider, і її не треба інжектити.

## Залежності

```
GameModule
├─ controllers: GameConfigController
└─ uses: ConfigService (для minBet/maxBet)
```

Жодних `imports` з інших модулів. Якщо колись з'явиться provider у `game/`, він не має тягнути за собою `PrismaModule` — це зламає purity ядра.

## Хто залежить від game

| Споживач | Що бере | Звідки |
|---|---|---|
| `BetsService` | `play`, `MIN_ROWS`, `MAX_ROWS`, `Risk` | `engine.ts`, `types.ts` |
| `SeedsService` (опосередковано — через типи) | `Risk` | `types.ts` |
| `GameConfigController` | `PAYOUT_TABLES`, `RISKS`, `MIN_ROWS`, `MAX_ROWS` | `payout-tables.ts`, `types.ts` |

## Інваріанти (де читати)

Не модифікуй `engine.ts` без розуміння наслідків:

- Engine purity (no DB / no `Date.now` / no `Math.random`), determinism, versionless contract → [.claude/rules/seeds.md](../../.claude/rules/seeds.md). Зміна функції `play` ламає reproducibility **всіх** історичних ставок.
- Як `play` викликається всередині locked-транзакції `BetsService.placeBet`, де `nonce` беруть **до** інкременту → [.claude/rules/bets.md](../../.claude/rules/bets.md).
- Структура `PAYOUT_TABLES[risk][rows]` (довжина = `rows + 1`, max 4 decimals) → [.claude/rules/seeds.md](../../.claude/rules/seeds.md).

## Тести

- [src/game/engine.spec.ts](../../src/game/engine.spec.ts) — **pinned test vectors**. Якщо ці вектори "зламались" після зміни в `engine.ts` — ти зламав fairness, тест правильний, не оновлюй його сліпо. Спочатку розслідуй у [.claude/skills/pre-commit/SKILL.md](../../.claude/skills/pre-commit/SKILL.md) і [.claude/rules/seeds.md](../../.claude/rules/seeds.md).
- E2E: контракт `play` опосередковано перевіряється в [test/e2e/bets.e2e-spec.ts](../../test/e2e/bets.e2e-spec.ts) і [test/e2e/seeds.e2e-spec.ts](../../test/e2e/seeds.e2e-spec.ts) — там клієнт повторює `play` після reveal seed'у та перевіряє відповідність історичним ставкам.

## Як змінювати

- Будь-яка зміна в `engine.ts` або `payout-tables.ts` — high-impact, оскільки впливає на існуючі `ACTIVE` seed'и в DB. Перед commit:
  1. Прочитай [.claude/rules/seeds.md](../../.claude/rules/seeds.md) (секція **Engine purity**).
  2. Пройди [.claude/skills/pre-commit/SKILL.md](../../.claude/skills/pre-commit/SKILL.md) — `npm run test:e2e` обов'язковий.
  3. Якщо engine реально треба змінити — мають бути або (a) version-поле на `Bet` із міграцією і backfill, або (b) force-reveal усіх `ACTIVE` seed'ів перед deploy.
- Зміна `PAYOUT_TABLES` без міграції теж змінить виплати для нових ставок на існуючих seed'ах — це ОК, але `Decimal(10,4)` і scaling factor `10_000n` у [src/wallet/wallet.service.ts](../../src/wallet/wallet.service.ts) мають лишатись узгодженими.
- Зміна `GameConfigController` (форма `GameConfigResponse`, нові поля) — це public API, оновлюй [.claude/rules/api.md](../../.claude/rules/api.md) тільки якщо вводиш нову конвенцію DTO/відповіді, інакше тільки додай поле і відрегресуй фронтенд.
