# Модуль `auth`

> Модульна довідка. Інваріанти й точні правила — у [.claude/rules/auth.md](../../.claude/rules/auth.md) та [.claude/rules/api.md](../../.claude/rules/api.md). Цей файл лише описує **що** є в модулі та **куди дивитися**, не дублюючи правил.

## Призначення

Видача й ротація JWT-токенів, реєстрація користувачів, перевірка пароля, захист controller-маршрутів через Passport JWT strategy. Модуль не зберігає raw refresh-токени та не повертає секрети — це enforce через rules і e2e тести.

## Публічна поверхня (HTTP)

Маршрути під префіксом `/api/v1/auth`. Усі описані в [src/auth/auth.controller.ts](../../src/auth/auth.controller.ts), форму відповіді задають DTO з `dto/auth-response.dto.ts`.

| Метод | Шлях | DTO body | Відповідь | Guard |
|---|---|---|---|---|
| `POST` | `/auth/register` | [`RegisterDto`](../../src/auth/dto/register.dto.ts) | `AuthResponse` (201) | — |
| `POST` | `/auth/login` | [`LoginDto`](../../src/auth/dto/login.dto.ts) | `TokensResponse` (200) | — |
| `POST` | `/auth/refresh` | [`RefreshDto`](../../src/auth/dto/refresh.dto.ts) | `TokensResponse` (200) | — |
| `POST` | `/auth/logout` | [`LogoutDto`](../../src/auth/dto/logout.dto.ts) | `204 No Content` | `JwtAccessGuard` |

Swagger тег `auth`, bearer scheme `access-token`.

## Експортовані будівельні блоки

`AuthModule` експортує два провайдери, якими користуються інші модулі (див. [src/auth/auth.module.ts](../../src/auth/auth.module.ts)):

- `AuthService` — `register`, `login`, `refresh`, `logout`, приватний `issueTokens`. Реалізація в [src/auth/auth.service.ts](../../src/auth/auth.service.ts).
- `JwtAccessStrategy` — Passport strategy з ім'ям `jwt-access` ([src/auth/jwt-access.strategy.ts](../../src/auth/jwt-access.strategy.ts)).

Усе інше — internal:

- [src/auth/jwt-access.guard.ts](../../src/auth/jwt-access.guard.ts) — `@UseGuards(JwtAccessGuard)` для захищених контролерів. Імпортується напряму з шляху, не через barrel.
- [src/auth/current-user.decorator.ts](../../src/auth/current-user.decorator.ts) — `@CurrentUser() u: AuthUser`. Єдине законне джерело `userId` у захищених handler'ах (див. invariant у [auth rule](../../.claude/rules/auth.md)).
- [src/auth/password.ts](../../src/auth/password.ts) — `hashPassword` / `verifyPassword` через `bcrypt` cost 12. Не використовуй `bcrypt` напряму поза цим файлом.
- [src/auth/tokens.ts](../../src/auth/tokens.ts) — `sha256` (для зберігання refresh-токенів як хеш) і `newJti` (рандомний UUID для refresh JTI).
- [src/auth/duration.ts](../../src/auth/duration.ts) — парсить `15m` / `7d` / `30s` у `Date`, потрібно щоб `expiresAt` у DB збігався з JWT `expiresIn`.
- [src/auth/types.ts](../../src/auth/types.ts) — `JwtAccessPayload`, `JwtRefreshPayload`, `AuthUser`.

## Залежності

```
AuthModule
├─ imports: UsersModule, PassportModule, JwtModule.register({})
├─ providers: AuthService, JwtAccessStrategy
└─ uses: PrismaService (через @Global PrismaModule), ConfigService
```

`JwtModule.register({})` — без default secret. Секрет і TTL передаємо у виклик `jwt.signAsync` per-token, бо access і refresh підписуються **різними** секретами (`JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET`).

## Хто залежить від auth

| Споживач | Що бере |
|---|---|
| `UsersController` | `JwtAccessGuard`, `@CurrentUser()`, `AuthUser` |
| `BetsController`, `SeedsController` | те саме |

Якщо змінюєш форму `AuthUser` або контракт guard'а — пройдись по всіх контролерах із `@UseGuards(JwtAccessGuard)`.

## Конфіг

Зчитується через `ConfigService` з валідованого `EnvSchema` ([src/config/env.validation.ts](../../src/config/env.validation.ts)):

- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — обидва ≥32 символів, **різні**.
- `JWT_ACCESS_TTL` (default `15m`), `JWT_REFRESH_TTL` (default `7d`) — формат `^(\d+)([smhd])$`.

## Тести

- Юніт: [src/auth/password.spec.ts](../../src/auth/password.spec.ts), [src/auth/tokens.spec.ts](../../src/auth/tokens.spec.ts), [src/auth/duration.spec.ts](../../src/auth/duration.spec.ts) — чисті функції.
- E2E: [test/e2e/auth.e2e-spec.ts](../../test/e2e/auth.e2e-spec.ts) — повний цикл register → login → protected route → refresh → logout → refresh-after-logout (має повернути 401). Це канонічна регресія для контракту токенів.

## Інваріанти (де читати)

Не повторюй їх тут — читай безпосередньо в правилах перед редагуванням:

- Token model, refresh rotation, response hygiene, authorization model → [.claude/rules/auth.md](../../.claude/rules/auth.md).
- Validation pipe, BigInt serialization, error shape, Swagger DTO convention → [.claude/rules/api.md](../../.claude/rules/api.md).
- `RefreshToken.tokenHash @unique` як load-bearing constraint → [.claude/rules/prisma.md](../../.claude/rules/prisma.md).

## Як змінювати

- Перед `git commit` будь-якої зміни в `src/auth/**` чи `test/e2e/auth*` — пройди [.claude/skills/pre-commit/SKILL.md](../../.claude/skills/pre-commit/SKILL.md). Зміни в цьому модулі завжди вимагають `npm run test:e2e -- auth.e2e-spec.ts`.
- Перед production deploy (новий env var, зміна TTL, новий тип токена) — [.claude/skills/deploy-flow/SKILL.md](../../.claude/skills/deploy-flow/SKILL.md).
