# Модуль `users`

> Інваріанти — у [.claude/rules/auth.md](../../.claude/rules/auth.md) (response hygiene, registration lifecycle) і [.claude/rules/prisma.md](../../.claude/rules/prisma.md) (транзакції, money columns). Тут — мапа модуля.

## Призначення

Доступ до `User`-сутності та її балансу. Видає safe-projection профілю автентифікованому користувачу і експортує `UsersService`, через який `AuthService` створює користувача разом з початковим `ACTIVE` seed'ом в одній транзакції.

Жодних role/permission концептів — кожен користувач бачить лише свої дані, фільтр `userId` накладає сам сервіс (див. invariant в [auth rule](../../.claude/rules/auth.md)).

## Публічна поверхня (HTTP)

| Метод | Шлях | Guard | Body | Відповідь |
|---|---|---|---|---|
| `GET` | `/api/v1/users/me` | `JwtAccessGuard` | — | [`UserResponse`](../../src/users/dto/user.response.ts) |

Реалізація: [src/users/users.controller.ts](../../src/users/users.controller.ts). Swagger тег `users`, bearer `access-token`. Це **канонічна** safe-projection користувача — копіюй цю форму, якщо додаєш нові user-facing endpoints (не повертай `passwordHash`, не повертай refresh-токени).

## Експортовані будівельні блоки

`UsersModule` ([src/users/users.module.ts](../../src/users/users.module.ts)) експортує `UsersService` із трьома методами ([src/users/users.service.ts](../../src/users/users.service.ts)):

- `findByEmail(email)` — `prisma.user.findUnique({ where: { email } })`. Повертає повний `User` (включно з `passwordHash`) — цей метод використовується тільки в `AuthService` для перевірки логіну. Не виставляй результат назовні без проекції.
- `findById(id)` — те саме за `id`. Використовується контролером `me` і всередині захищених flows.
- `createWithSeed(email, passwordHash)` — створює `User` **і** початковий `ACTIVE` `Seed` у **одній** `prisma.$transaction`. Початковий баланс — `INITIAL_USER_BALANCE = 10_000_000_000n` (10B мінімальних одиниць). Розрив цього на дві транзакції зламає інваріант "user without active seed cannot place bets" — детально в [.claude/rules/auth.md](../../.claude/rules/auth.md).

## Залежності

```
UsersModule
├─ imports: SeedsModule          # для createForUser(tx, userId) усередині транзакції
├─ controllers: UsersController
├─ providers: UsersService
└─ uses: PrismaService (через @Global PrismaModule)
```

## Хто залежить від users

- `AuthModule` імпортує `UsersModule`, щоб `AuthService` міг звертатися до `findByEmail` / `createWithSeed`.

Зверни увагу на циклічний потенціал: `UsersModule → SeedsModule`, `AuthModule → UsersModule`. Не імпортуй `AuthModule` зі `UsersModule` — це призведе до циклу.

## Money / BigInt

`User.balance` — `BigInt` в DB (Postgres `BIGINT`), `bigint` у TS. Серіалізується в JSON як **string** через [`BigIntInterceptor`](../../src/common/interceptors/bigint.interceptor.ts). Це фіксовано в DTO [`UserResponse.balance: string`](../../src/users/dto/user.response.ts) і в [.claude/rules/api.md](../../.claude/rules/api.md). Не намагайся повертати `balance` як `number`.

Баланс мутує **тільки** `WalletService.lockAndApply` всередині bet-транзакції — `UsersService` його не пише поза `createWithSeed`. Якщо потрібен новий шлях для мутації балансу (бонуси, повернення), він має йти через row-lock (`FOR UPDATE`) у транзакції — див. [.claude/rules/bets.md](../../.claude/rules/bets.md) і [.claude/rules/prisma.md](../../.claude/rules/prisma.md).

## Тести

- Юніт: [src/users/users.service.spec.ts](../../src/users/users.service.spec.ts) — `createWithSeed` мокає Prisma client і перевіряє, що user + seed створюються в одному `$transaction`.
- E2E: безпосереднього `users.e2e-spec.ts` немає. Контракт `GET /users/me` опосередковано покривається в [test/e2e/auth.e2e-spec.ts](../../test/e2e/auth.e2e-spec.ts) (login → call protected route), а `createWithSeed` — у [test/e2e/bets.e2e-spec.ts](../../test/e2e/bets.e2e-spec.ts) (бо для розміщення першої ставки треба, щоб користувач мав `ACTIVE` seed). Якщо додаєш нову операцію над користувачем — додай окремий e2e.

## Інваріанти (де читати)

- Response hygiene (ніколи не повертати `passwordHash`, `tokenHash`, raw `serverSeed`), registration lifecycle, authorization model → [.claude/rules/auth.md](../../.claude/rules/auth.md).
- Money як `BigInt` end-to-end, заборона `Number`-coerce → [.claude/rules/bets.md](../../.claude/rules/bets.md), [.claude/rules/prisma.md](../../.claude/rules/prisma.md).
- Транзакційність `createWithSeed`, `Prisma.TransactionClient` як перший аргумент helper'ів → [.claude/rules/prisma.md](../../.claude/rules/prisma.md).
- Swagger DTO convention для `*.response.ts` → [.claude/rules/api.md](../../.claude/rules/api.md).

## Як змінювати

- Перед `git commit` будь-якої зміни в `src/users/**` — [.claude/skills/pre-commit/SKILL.md](../../.claude/skills/pre-commit/SKILL.md). Зміна `createWithSeed` чи `findById` зачіпає `auth` і `bets` flow, тому потрібен `npm run test:e2e`.
- Будь-який новий endpoint під `/users` має йти через `JwtAccessGuard` + `@CurrentUser()`, без `:userId` path-параметра.
