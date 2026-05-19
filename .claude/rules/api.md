---
name: api
description: HTTP layer invariants — global prefix, validation, error shape, BigInt serialization, Swagger
paths:
  - 'src/**/*.controller.ts'
  - 'src/**/*.dto.ts'
  - 'src/**/*.query.ts'
  - 'src/**/*.response.ts'
  - 'src/common/**/*.ts'
  - 'src/main.ts'
  - 'test/e2e/**/*.ts'
---

# API / HTTP layer

Triggered when editing controllers, DTOs, global filters/interceptors, `main.ts`, or e2e specs.

## Routing

- Global prefix `api/v1` is set in [src/main.ts](../../src/main.ts); the only excluded route is `GET /health` ([src/common/health.controller.ts](../../src/common/health.controller.ts)). Do not call `setGlobalPrefix` elsewhere and do not hard-code `/api/v1` inside controllers.
- Swagger UI is mounted at `GET /docs`, JSON at `GET /docs-json`. Bearer auth scheme name is `access-token` — must match in `@ApiBearerAuth('access-token')` on protected controllers.

## Validation pipe (global)

`ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })` is installed globally. Consequences:

- Every request body / query is rejected if it contains unknown fields. Add a field to the DTO before relying on it in a service.
- `transform: true` runs `class-transformer` decorators. This is how raw JSON `"123"` becomes `BigInt(123)` on bet amounts (`@Transform(({ value }) => BigInt(value))`). Don't manually `BigInt(...)` in controllers — let the DTO do it.
- Use `class-validator` decorators on DTOs (`@IsString`, `@IsInt`, `@IsEnum`, `@Min`, `@Max`, etc.) — the Swagger CLI plugin reads them.

## BigInt serialization

`BigIntInterceptor` ([src/common/interceptors/bigint.interceptor.ts](../../src/common/interceptors/bigint.interceptor.ts)) recursively converts every `bigint` in the response to its string representation (`JSON.stringify` cannot handle BigInt). Rules:

- Return raw `bigint` from controllers/services. Do not pre-stringify or wrap in objects.
- `Date` and `Buffer` are passed through untouched — if you add a new "scalar" type, extend the interceptor explicitly.
- Frontend / e2e tests must parse these as strings, not numbers.

## Error shape

`AllExceptionsFilter` ([src/common/filters/all-exceptions.filter.ts](../../src/common/filters/all-exceptions.filter.ts)) normalizes every error to:

```json
{ "statusCode": 400, "message": "…", "error": "BadRequestException", "path": "/api/v1/bets" }
```

- Throw `HttpException` subclasses (`BadRequestException`, `UnauthorizedException`, `ForbiddenException`, `NotFoundException`, `ConflictException`) from services — the filter forwards their `getResponse()` payload.
- Unknown errors get logged with stack and returned as a generic 500. Never expose stack traces in responses.
- E2E specs assert on the four fields above — don't change the shape without updating tests.

## Swagger DTO convention

`nest-cli.json` enables `@nestjs/swagger` CLI plugin with `dtoFileNameSuffix: ['.dto.ts', '.query.ts', '.response.ts']`. Only files matching those suffixes get auto-introspected. Conventions:

- Request bodies → `*.dto.ts` (e.g. `create-bet.dto.ts`).
- Query params → `*.query.ts` (e.g. `list-bets.query.ts`).
- Response shapes → `*.response.ts` (e.g. `bet.response.ts`). Use a response class, not an interface — the plugin needs a runtime class.
- Reserve `@ApiProperty()` for fields the plugin can't infer (unions, generic wrappers, BigInt-as-string). For everything else, lean on `class-validator` decorators.
- Annotate controller methods with `@ApiOperation({ summary })`, `@ApiTags(...)`, and at least one `@Api{Ok,Created,NoContent}Response({ type })`.

## Auth on controllers

- Protected controllers: `@UseGuards(JwtAccessGuard)` + `@ApiBearerAuth('access-token')` at the class level. Then use `@CurrentUser() u: AuthUser` to read `{ id }`.
- Never accept `userId` from the request body — derive it from the JWT.

## Logging / redaction

Pino is set up in [src/app.module.ts](../../src/app.module.ts) with redaction of `req.headers.authorization`, `req.body.password`, `req.body.refreshToken`. If you add a new secret-bearing field (e.g. `seedSecret`), extend the `redact` array.
