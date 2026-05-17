# Plinko Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a NestJS + Prisma + Postgres backend for a Plinko iGaming service with JWT auth, provably-fair game logic, bet history, and Fly.io deployment.

**Architecture:** Modular NestJS app. A pure deterministic Plinko engine (HMAC-SHA256) sits behind a transactional bet service that atomically debits balance, advances a per-user seed nonce, and credits payout. Auth uses access (15min) + refresh (7d) JWTs with hashed refresh tokens in Postgres. Deployed as a single Docker image on Fly.io with managed Postgres; migrations run via `release_command`.

**Tech Stack:** Node.js 20, TypeScript (strict), NestJS 10, Prisma 5, PostgreSQL 16, `@nestjs/jwt` + `@nestjs/passport` + `passport-jwt`, `bcrypt`, `pino`, Jest, Supertest, Docker, Fly.io.

**Spec:** `docs/superpowers/specs/2026-05-17-plinko-backend-design.md`

---

## File Structure

```
src/
  main.ts                        — bootstrap, global pipes/filters/interceptors
  app.module.ts                  — root module wiring

  prisma/
    prisma.module.ts             — global module exporting PrismaService
    prisma.service.ts            — Prisma client + onModuleInit/onModuleDestroy

  config/
    env.validation.ts            — class-validator schema for process.env
    config.module.ts             — @nestjs/config with the validator

  common/
    interceptors/bigint.interceptor.ts  — converts BigInt -> string in responses
    filters/all-exceptions.filter.ts    — uniform { statusCode, message, error }
    health.controller.ts                — GET /health

  auth/
    auth.module.ts
    auth.controller.ts           — /auth/{register,login,refresh,logout}
    auth.service.ts              — orchestrates user + token lifecycle
    password.ts                  — bcrypt hash + compare
    tokens.ts                    — sign access/refresh, sha256(refresh)
    jwt-access.strategy.ts       — passport-jwt strategy for access token
    jwt-access.guard.ts          — @UseGuards target
    dto/register.dto.ts
    dto/login.dto.ts
    dto/refresh.dto.ts
    dto/logout.dto.ts
    types.ts                     — AuthUser, JwtPayload

  users/
    users.module.ts
    users.controller.ts          — GET /users/me
    users.service.ts             — findById, findByEmail, createWithSeed

  wallet/
    wallet.module.ts
    wallet.service.ts            — debitAndCredit(tx, userId, amount, payout)

  game/
    game.module.ts
    engine.ts                    — pure play() function
    payout-tables.ts             — PAYOUT_TABLES constant
    types.ts                     — Risk enum mirror, PlayResult
    config.controller.ts         — GET /game/config

  seeds/
    seeds.module.ts
    seeds.controller.ts          — /seeds/{active,client,rotate,:id}
    seeds.service.ts             — createForUser, getActiveForUpdate, rotate, reveal
    dto/update-client-seed.dto.ts
    dto/rotate-seed.dto.ts

  bets/
    bets.module.ts
    bets.controller.ts           — POST /bets, GET /bets, GET /bets/:id
    bets.service.ts              — placeBet (transaction), list, getById
    dto/create-bet.dto.ts
    dto/list-bets.query.ts

prisma/
  schema.prisma
  migrations/

test/
  e2e/
    auth.e2e-spec.ts
    bets.e2e-spec.ts
    seeds.e2e-spec.ts
    bets-concurrent.e2e-spec.ts   — race-condition test

Dockerfile
fly.toml
docker-compose.yml               — local Postgres
.env.example
.github/workflows/ci.yml
package.json
tsconfig.json
nest-cli.json
jest.config.ts
README.md
```

---

## Task 1: Bootstrap NestJS project + tooling

**Files:**
- Create: `package.json`, `tsconfig.json`, `tsconfig.build.json`, `nest-cli.json`, `jest.config.ts`, `.eslintrc.js`, `.prettierrc`, `.gitignore`, `.env.example`, `src/main.ts`, `src/app.module.ts`, `src/app.controller.ts.spec.ts`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "plinko-be",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "build": "nest build",
    "start": "node dist/main.js",
    "start:dev": "nest start --watch",
    "lint": "eslint \"{src,test}/**/*.ts\" --fix",
    "typecheck": "tsc --noEmit",
    "test": "jest",
    "test:e2e": "jest --config jest.e2e.config.ts --runInBand",
    "prisma:generate": "prisma generate",
    "prisma:migrate": "prisma migrate dev",
    "prisma:deploy": "prisma migrate deploy"
  },
  "dependencies": {
    "@nestjs/common": "^10.3.0",
    "@nestjs/config": "^3.2.0",
    "@nestjs/core": "^10.3.0",
    "@nestjs/jwt": "^10.2.0",
    "@nestjs/passport": "^10.0.3",
    "@nestjs/platform-express": "^10.3.0",
    "@prisma/client": "^5.10.0",
    "bcrypt": "^5.1.1",
    "class-transformer": "^0.5.1",
    "class-validator": "^0.14.1",
    "nestjs-pino": "^4.0.0",
    "passport": "^0.7.0",
    "passport-jwt": "^4.0.1",
    "pino-http": "^9.0.0",
    "reflect-metadata": "^0.2.1",
    "rxjs": "^7.8.1"
  },
  "devDependencies": {
    "@nestjs/cli": "^10.3.0",
    "@nestjs/schematics": "^10.1.0",
    "@nestjs/testing": "^10.3.0",
    "@types/bcrypt": "^5.0.2",
    "@types/jest": "^29.5.12",
    "@types/node": "^20.11.0",
    "@types/passport-jwt": "^4.0.1",
    "@types/supertest": "^6.0.2",
    "@typescript-eslint/eslint-plugin": "^7.0.0",
    "@typescript-eslint/parser": "^7.0.0",
    "eslint": "^8.57.0",
    "eslint-config-prettier": "^9.1.0",
    "jest": "^29.7.0",
    "pino-pretty": "^11.0.0",
    "prettier": "^3.2.5",
    "prisma": "^5.10.0",
    "supertest": "^6.3.4",
    "ts-jest": "^29.1.2",
    "ts-loader": "^9.5.1",
    "ts-node": "^10.9.2",
    "tsconfig-paths": "^4.2.0",
    "typescript": "^5.3.3"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json` and `tsconfig.build.json`**

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "module": "commonjs",
    "target": "ES2022",
    "moduleResolution": "node",
    "declaration": false,
    "removeComments": true,
    "emitDecoratorMetadata": true,
    "experimentalDecorators": true,
    "allowSyntheticDefaultImports": true,
    "esModuleInterop": true,
    "sourceMap": true,
    "outDir": "./dist",
    "baseUrl": "./",
    "incremental": true,
    "skipLibCheck": true,
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

`tsconfig.build.json`:
```json
{
  "extends": "./tsconfig.json",
  "exclude": ["node_modules", "test", "dist", "**/*spec.ts"]
}
```

- [ ] **Step 3: Create `nest-cli.json`, `.gitignore`, `.env.example`**

`nest-cli.json`:
```json
{
  "$schema": "https://json.schemastore.org/nest-cli",
  "collection": "@nestjs/schematics",
  "sourceRoot": "src",
  "compilerOptions": { "deleteOutDir": true }
}
```

`.gitignore`:
```
node_modules
dist
coverage
.env
.env.local
.env.test
.DS_Store
*.log
```

`.env.example`:
```
DATABASE_URL=postgres://plinko:plinko@localhost:5432/plinko
JWT_ACCESS_SECRET=change-me-access-64-bytes-hex
JWT_REFRESH_SECRET=change-me-refresh-64-bytes-hex
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
MIN_BET=1000000
MAX_BET=1000000000000
PORT=3000
NODE_ENV=development
LOG_LEVEL=debug
```

- [ ] **Step 4: Create `jest.config.ts`**

```ts
import type { Config } from 'jest';
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
export default config;
```

- [ ] **Step 5: Create `src/main.ts` and `src/app.module.ts` (minimal)**

`src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
@Module({})
export class AppModule {}
```

`src/main.ts`:
```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Step 6: Install and verify build**

```bash
npm install
npm run typecheck
npm run build
```

Expected: no type errors; `dist/main.js` exists.

- [ ] **Step 7: Commit**

```bash
git add .
git commit -m "chore: bootstrap NestJS project skeleton"
```

---

## Task 2: Prisma schema + local Postgres + initial migration

**Files:**
- Create: `prisma/schema.prisma`, `docker-compose.yml`, `src/prisma/prisma.service.ts`, `src/prisma/prisma.module.ts`

- [ ] **Step 1: Create `docker-compose.yml` for local Postgres**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: plinko
      POSTGRES_PASSWORD: plinko
      POSTGRES_DB: plinko
    ports:
      - "5432:5432"
    volumes:
      - plinko_pg:/var/lib/postgresql/data
volumes:
  plinko_pg:
```

- [ ] **Step 2: Start Postgres and copy env**

```bash
docker compose up -d
cp .env.example .env
```

Expected: Postgres healthy on `localhost:5432`.

- [ ] **Step 3: Create `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String
  balance       BigInt   @default(0)
  createdAt     DateTime @default(now())

  bets          Bet[]
  seeds         Seed[]
  refreshTokens RefreshToken[]
}

model RefreshToken {
  id        String    @id @default(uuid())
  userId    String
  tokenHash String    @unique
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model Seed {
  id             String     @id @default(uuid())
  userId         String
  serverSeed     String
  serverSeedHash String
  clientSeed     String
  nonce          Int        @default(0)
  status         SeedStatus @default(ACTIVE)
  createdAt      DateTime   @default(now())
  revealedAt     DateTime?

  user           User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  bets           Bet[]

  @@index([userId, status])
}

enum SeedStatus {
  ACTIVE
  REVEALED
}

model Bet {
  id           String   @id @default(uuid())
  userId       String
  seedId       String
  nonce        Int
  amount       BigInt
  rows         Int
  risk         Risk
  path         String
  bucketIndex  Int
  multiplier   Decimal  @db.Decimal(10, 4)
  payout       BigInt
  balanceAfter BigInt
  createdAt    DateTime @default(now())

  user         User     @relation(fields: [userId], references: [id])
  seed         Seed     @relation(fields: [seedId], references: [id])

  @@index([userId, createdAt(sort: Desc)])
  @@unique([seedId, nonce])
}

enum Risk {
  LOW
  MEDIUM
  HIGH
}
```

- [ ] **Step 4: Generate client and run initial migration**

```bash
npx prisma migrate dev --name init
```

Expected: `prisma/migrations/<timestamp>_init/` created; tables exist in DB.

- [ ] **Step 5: Create `src/prisma/prisma.service.ts`**

```ts
import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
```

- [ ] **Step 6: Create `src/prisma/prisma.module.ts`**

```ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 7: Wire into `AppModule` and verify**

`src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';

@Module({ imports: [PrismaModule] })
export class AppModule {}
```

```bash
npm run build
```

Expected: success.

- [ ] **Step 8: Commit**

```bash
git add prisma docker-compose.yml src/prisma src/app.module.ts package.json package-lock.json
git commit -m "feat: add Prisma schema, initial migration, and local Postgres"
```

---

## Task 3: Config module with env validation

**Files:**
- Create: `src/config/env.validation.ts`, `src/config/config.module.ts`

- [ ] **Step 1: Write the failing test**

`src/config/env.validation.spec.ts`:
```ts
import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const base = {
    DATABASE_URL: 'postgres://x',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    MIN_BET: '1000000',
    MAX_BET: '1000000000000',
    PORT: '3000',
    NODE_ENV: 'test',
  };

  it('accepts a valid env', () => {
    expect(() => validateEnv(base)).not.toThrow();
  });

  it('rejects missing JWT secrets', () => {
    const { JWT_ACCESS_SECRET, ...rest } = base;
    expect(() => validateEnv(rest)).toThrow();
  });

  it('coerces numeric strings', () => {
    const v = validateEnv(base);
    expect(typeof v.PORT).toBe('number');
    expect(typeof v.MIN_BET).toBe('bigint');
    expect(v.MIN_BET).toBe(1_000_000n);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npm test -- env.validation.spec
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement `src/config/env.validation.ts`**

```ts
import { plainToInstance, Transform } from 'class-transformer';
import { IsEnum, IsInt, IsString, MinLength, validateSync } from 'class-validator';

export class EnvSchema {
  @IsString() @MinLength(1)
  DATABASE_URL!: string;

  @IsString() @MinLength(32)
  JWT_ACCESS_SECRET!: string;

  @IsString() @MinLength(32)
  JWT_REFRESH_SECRET!: string;

  @IsString() JWT_ACCESS_TTL!: string;
  @IsString() JWT_REFRESH_TTL!: string;

  @Transform(({ value }) => BigInt(value))
  MIN_BET!: bigint;

  @Transform(({ value }) => BigInt(value))
  MAX_BET!: bigint;

  @Transform(({ value }) => parseInt(value, 10))
  @IsInt()
  PORT!: number;

  @IsEnum(['development', 'test', 'production'])
  NODE_ENV!: 'development' | 'test' | 'production';
}

export function validateEnv(raw: Record<string, unknown>): EnvSchema {
  const instance = plainToInstance(EnvSchema, raw, { enableImplicitConversion: false });
  const errors = validateSync(instance, { skipMissingProperties: false });
  if (errors.length) {
    throw new Error(`Env validation failed:\n${errors.map(e => e.toString()).join('\n')}`);
  }
  return instance;
}
```

- [ ] **Step 4: Run tests**

```bash
npm test -- env.validation.spec
```

Expected: PASS.

- [ ] **Step 5: Create `src/config/config.module.ts`**

```ts
import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import { validateEnv } from './env.validation';

@Global()
@Module({
  imports: [NestConfigModule.forRoot({ isGlobal: true, validate: validateEnv })],
  exports: [NestConfigModule],
})
export class ConfigModule {}
```

- [ ] **Step 6: Wire into `AppModule`**

```ts
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { ConfigModule } from './config/config.module';

@Module({ imports: [ConfigModule, PrismaModule] })
export class AppModule {}
```

- [ ] **Step 7: Commit**

```bash
git add src/config src/app.module.ts
git commit -m "feat(config): add validated env loading"
```

---

## Task 4: Global BigInt serializer, exception filter, health endpoint

**Files:**
- Create: `src/common/interceptors/bigint.interceptor.ts`, `src/common/filters/all-exceptions.filter.ts`, `src/common/health.controller.ts`, `src/common/common.module.ts`
- Modify: `src/main.ts`, `src/app.module.ts`

- [ ] **Step 1: Test for BigInt interceptor**

`src/common/interceptors/bigint.interceptor.spec.ts`:
```ts
import { BigIntInterceptor } from './bigint.interceptor';
import { of, lastValueFrom } from 'rxjs';

describe('BigIntInterceptor', () => {
  it('stringifies BigInt values recursively', async () => {
    const interceptor = new BigIntInterceptor();
    const handler = { handle: () => of({ a: 10n, b: { c: [1n, 2n] }, d: 'x' }) } as any;
    const result = await lastValueFrom(interceptor.intercept({} as any, handler));
    expect(result).toEqual({ a: '10', b: { c: ['1', '2'] }, d: 'x' });
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npm test -- bigint.interceptor.spec
```

Expected: FAIL.

- [ ] **Step 3: Implement interceptor**

`src/common/interceptors/bigint.interceptor.ts`:
```ts
import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

function convert(value: unknown): unknown {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(convert);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = convert(v);
    return out;
  }
  return value;
}

@Injectable()
export class BigIntInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(convert));
  }
}
```

- [ ] **Step 4: Run test, expect PASS**

```bash
npm test -- bigint.interceptor.spec
```

- [ ] **Step 5: Implement exception filter**

`src/common/filters/all-exceptions.filter.ts`:
```ts
import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse();
    const req = ctx.getRequest();

    const isHttp = exception instanceof HttpException;
    const status = isHttp ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;
    const payload = isHttp ? exception.getResponse() : { message: 'Internal server error' };
    const body = typeof payload === 'string' ? { message: payload } : (payload as Record<string, unknown>);

    if (!isHttp) this.logger.error(`Unhandled: ${String(exception)}`, (exception as Error)?.stack);

    res.status(status).json({
      statusCode: status,
      message: body.message ?? 'Error',
      error: body.error ?? (isHttp ? exception.name : 'InternalServerError'),
      path: req.url,
    });
  }
}
```

- [ ] **Step 6: Implement health controller**

`src/common/health.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';

@Controller({ path: 'health', version: undefined })
export class HealthController {
  @Get()
  check() {
    return { status: 'ok' };
  }
}
```

`src/common/common.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';

@Module({ controllers: [HealthController] })
export class CommonModule {}
```

- [ ] **Step 7: Wire globals in `src/main.ts`**

```ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { BigIntInterceptor } from './common/interceptors/bigint.interceptor';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api/v1', { exclude: ['health'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
  app.useGlobalInterceptors(new BigIntInterceptor());
  app.useGlobalFilters(new AllExceptionsFilter());
  await app.listen(Number(process.env.PORT ?? 3000));
}
bootstrap();
```

Add `CommonModule` to `AppModule.imports`.

- [ ] **Step 8: Smoke test the running app**

```bash
npm run start:dev &
sleep 3
curl -s localhost:3000/health
kill %1
```

Expected: `{"status":"ok"}`.

- [ ] **Step 9: Commit**

```bash
git add src/common src/main.ts src/app.module.ts
git commit -m "feat(common): add BigInt interceptor, exception filter, health check"
```

---

## Task 5: Plinko game engine (pure HMAC-SHA256 play function)

**Files:**
- Create: `src/game/types.ts`, `src/game/payout-tables.ts`, `src/game/engine.ts`, `src/game/engine.spec.ts`

- [ ] **Step 1: Create types and the payout-tables stub**

`src/game/types.ts`:
```ts
export type Risk = 'LOW' | 'MEDIUM' | 'HIGH';
export const RISKS: Risk[] = ['LOW', 'MEDIUM', 'HIGH'];
export const MIN_ROWS = 8;
export const MAX_ROWS = 16;

export interface PlayResult {
  path: ('L' | 'R')[];
  bucketIndex: number;
  multiplier: number;
}
```

`src/game/payout-tables.ts` (Stake-style values, RTP ≈ 99%):
```ts
import { Risk } from './types';

export const PAYOUT_TABLES: Record<Risk, Record<number, number[]>> = {
  LOW: {
    8:  [5.6, 2.1, 1.1, 1.0, 0.5, 1.0, 1.1, 2.1, 5.6],
    9:  [5.6, 2.0, 1.6, 1.0, 0.7, 0.7, 1.0, 1.6, 2.0, 5.6],
    10: [8.9, 3.0, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 3.0, 8.9],
    11: [8.4, 3.0, 1.9, 1.3, 1.0, 0.7, 0.7, 1.0, 1.3, 1.9, 3.0, 8.4],
    12: [10, 3.0, 1.6, 1.4, 1.1, 1.0, 0.5, 1.0, 1.1, 1.4, 1.6, 3.0, 10],
    13: [8.1, 4.0, 3.0, 1.9, 1.2, 0.9, 0.7, 0.7, 0.9, 1.2, 1.9, 3.0, 4.0, 8.1],
    14: [7.1, 4.0, 1.9, 1.4, 1.3, 1.1, 1.0, 0.5, 1.0, 1.1, 1.3, 1.4, 1.9, 4.0, 7.1],
    15: [15, 8.0, 3.0, 2.0, 1.5, 1.1, 1.0, 0.7, 0.7, 1.0, 1.1, 1.5, 2.0, 3.0, 8.0, 15],
    16: [16, 9.0, 2.0, 1.4, 1.4, 1.2, 1.1, 1.0, 0.5, 1.0, 1.1, 1.2, 1.4, 1.4, 2.0, 9.0, 16],
  },
  MEDIUM: {
    8:  [13, 3.0, 1.3, 0.7, 0.4, 0.7, 1.3, 3.0, 13],
    9:  [18, 4.0, 1.7, 0.9, 0.5, 0.5, 0.9, 1.7, 4.0, 18],
    10: [22, 5.0, 2.0, 1.4, 0.6, 0.4, 0.6, 1.4, 2.0, 5.0, 22],
    11: [24, 6.0, 3.0, 1.8, 0.7, 0.5, 0.5, 0.7, 1.8, 3.0, 6.0, 24],
    12: [33, 11, 4.0, 2.0, 1.1, 0.6, 0.3, 0.6, 1.1, 2.0, 4.0, 11, 33],
    13: [43, 13, 6.0, 3.0, 1.3, 0.7, 0.4, 0.4, 0.7, 1.3, 3.0, 6.0, 13, 43],
    14: [58, 15, 7.0, 4.0, 1.9, 1.0, 0.5, 0.2, 0.5, 1.0, 1.9, 4.0, 7.0, 15, 58],
    15: [88, 18, 11, 5.0, 3.0, 1.3, 0.5, 0.3, 0.3, 0.5, 1.3, 3.0, 5.0, 11, 18, 88],
    16: [110, 41, 10, 5.0, 3.0, 1.5, 1.0, 0.5, 0.3, 0.5, 1.0, 1.5, 3.0, 5.0, 10, 41, 110],
  },
  HIGH: {
    8:  [29, 4.0, 1.5, 0.3, 0.2, 0.3, 1.5, 4.0, 29],
    9:  [43, 7.0, 2.0, 0.6, 0.2, 0.2, 0.6, 2.0, 7.0, 43],
    10: [76, 10, 3.0, 0.9, 0.3, 0.2, 0.3, 0.9, 3.0, 10, 76],
    11: [120, 14, 5.2, 1.4, 0.4, 0.2, 0.2, 0.4, 1.4, 5.2, 14, 120],
    12: [170, 24, 8.1, 2.0, 0.7, 0.2, 0.2, 0.2, 0.7, 2.0, 8.1, 24, 170],
    13: [260, 37, 11, 4.0, 1.0, 0.2, 0.2, 0.2, 0.2, 1.0, 4.0, 11, 37, 260],
    14: [420, 56, 18, 5.0, 1.9, 0.3, 0.2, 0.2, 0.2, 0.3, 1.9, 5.0, 18, 56, 420],
    15: [620, 83, 27, 8.0, 3.0, 0.5, 0.2, 0.2, 0.2, 0.2, 0.5, 3.0, 8.0, 27, 83, 620],
    16: [1000, 130, 26, 9.0, 4.0, 2.0, 0.2, 0.2, 0.2, 0.2, 0.2, 2.0, 4.0, 9.0, 26, 130, 1000],
  },
};
```

- [ ] **Step 2: Write failing tests for the engine**

`src/game/engine.spec.ts`:
```ts
import { play } from './engine';
import { PAYOUT_TABLES } from './payout-tables';
import { Risk, RISKS } from './types';

describe('Plinko engine', () => {
  const seed = 'a'.repeat(64);
  const client = 'client';

  it('produces a path of length === rows', () => {
    const r = play(seed, client, 0, 10, 'HIGH');
    expect(r.path).toHaveLength(10);
    r.path.forEach(c => expect(['L', 'R']).toContain(c));
  });

  it('bucketIndex equals count of R', () => {
    const r = play(seed, client, 7, 12, 'MEDIUM');
    const rCount = r.path.filter(c => c === 'R').length;
    expect(r.bucketIndex).toBe(rCount);
  });

  it('multiplier matches payout table at bucketIndex', () => {
    const r = play(seed, client, 3, 16, 'LOW');
    expect(r.multiplier).toBe(PAYOUT_TABLES.LOW[16][r.bucketIndex]);
  });

  it('is deterministic', () => {
    const a = play(seed, client, 42, 10, 'HIGH');
    const b = play(seed, client, 42, 10, 'HIGH');
    expect(a).toEqual(b);
  });

  it('differs across nonces', () => {
    const a = play(seed, client, 1, 10, 'HIGH');
    const b = play(seed, client, 2, 10, 'HIGH');
    expect(a.path.join('')).not.toEqual(b.path.join(''));
  });

  it('rejects out-of-range rows', () => {
    expect(() => play(seed, client, 0, 7, 'LOW')).toThrow();
    expect(() => play(seed, client, 0, 17, 'LOW')).toThrow();
  });

  it('all risks/rows configured in payout tables', () => {
    for (const risk of RISKS) {
      for (let rows = 8; rows <= 16; rows++) {
        expect(PAYOUT_TABLES[risk][rows]).toHaveLength(rows + 1);
      }
    }
  });

  it('distribution sanity: 50000 plays produce a bell-curve centred around rows/2', () => {
    const counts = new Array(11).fill(0);
    for (let n = 0; n < 50000; n++) {
      counts[play(seed, client, n, 10, 'HIGH').bucketIndex]++;
    }
    // Centre bucket must be the modal one for 10 rows.
    const maxIdx = counts.indexOf(Math.max(...counts));
    expect(maxIdx).toBe(5);
  });
});
```

- [ ] **Step 3: Run, confirm failure**

```bash
npm test -- engine.spec
```

Expected: FAIL (module not found).

- [ ] **Step 4: Implement `src/game/engine.ts`**

```ts
import { createHmac } from 'crypto';
import { PAYOUT_TABLES } from './payout-tables';
import { MAX_ROWS, MIN_ROWS, PlayResult, Risk } from './types';

export function play(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  rows: number,
  risk: Risk,
): PlayResult {
  if (!Number.isInteger(rows) || rows < MIN_ROWS || rows > MAX_ROWS) {
    throw new Error(`rows must be integer in [${MIN_ROWS}, ${MAX_ROWS}]`);
  }
  if (!Number.isInteger(nonce) || nonce < 0) {
    throw new Error('nonce must be non-negative integer');
  }

  const hmac = createHmac('sha256', serverSeed)
    .update(`${clientSeed}:${nonce}`)
    .digest();

  const path: ('L' | 'R')[] = [];
  for (let i = 0; i < rows; i++) {
    path.push(hmac[i] < 128 ? 'L' : 'R');
  }
  const bucketIndex = path.reduce((n, c) => n + (c === 'R' ? 1 : 0), 0);
  const multiplier = PAYOUT_TABLES[risk][rows][bucketIndex];
  return { path, bucketIndex, multiplier };
}
```

- [ ] **Step 5: Run all engine tests, expect PASS**

```bash
npm test -- engine.spec
```

- [ ] **Step 6: Create `src/game/game.module.ts` and `src/game/config.controller.ts`**

`src/game/config.controller.ts`:
```ts
import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PAYOUT_TABLES } from './payout-tables';
import { MAX_ROWS, MIN_ROWS, RISKS } from './types';

@Controller('game/config')
export class GameConfigController {
  constructor(private readonly cfg: ConfigService) {}

  @Get()
  get() {
    const rows: number[] = [];
    for (let r = MIN_ROWS; r <= MAX_ROWS; r++) rows.push(r);
    return {
      rows,
      risks: RISKS,
      minBet: this.cfg.get<bigint>('MIN_BET'),
      maxBet: this.cfg.get<bigint>('MAX_BET'),
      payoutTables: PAYOUT_TABLES,
    };
  }
}
```

`src/game/game.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { GameConfigController } from './config.controller';

@Module({ controllers: [GameConfigController] })
export class GameModule {}
```

Add `GameModule` to `AppModule.imports`.

- [ ] **Step 7: Commit**

```bash
git add src/game src/app.module.ts
git commit -m "feat(game): pure Plinko engine + payout tables + GET /game/config"
```

---

## Task 6: Wallet service (atomic debit-and-credit)

**Files:**
- Create: `src/wallet/wallet.service.ts`, `src/wallet/wallet.module.ts`, `src/wallet/wallet.service.spec.ts`

- [ ] **Step 1: Test design — describe behaviour**

`src/wallet/wallet.service.spec.ts`:
```ts
import { WalletService } from './wallet.service';

describe('WalletService.applyBet (unit)', () => {
  it('returns balance - amount + payout', () => {
    const svc = new WalletService();
    expect(svc.computeBalanceAfter(10_000n, 1000n, 2500n)).toBe(11_500n);
  });

  it('throws when balance < amount', () => {
    const svc = new WalletService();
    expect(() => svc.computeBalanceAfter(500n, 1000n, 0n)).toThrow();
  });

  it('floor-rounds payout from multiplier', () => {
    const svc = new WalletService();
    // amount 1000 * multiplier 0.2 = 200
    expect(svc.computePayout(1000n, 0.2)).toBe(200n);
    // 1000 * 1.1 = 1100
    expect(svc.computePayout(1000n, 1.1)).toBe(1100n);
    // 333 * 0.7 = 233.1 → 233
    expect(svc.computePayout(333n, 0.7)).toBe(233n);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test -- wallet.service.spec
```

- [ ] **Step 3: Implement `src/wallet/wallet.service.ts`**

```ts
import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class WalletService {
  /** floor(amount * multiplier) using a 4-decimal fixed-point conversion. */
  computePayout(amount: bigint, multiplier: number): bigint {
    const m = BigInt(Math.round(multiplier * 10_000));
    return (amount * m) / 10_000n;
  }

  computeBalanceAfter(balance: bigint, amount: bigint, payout: bigint): bigint {
    if (balance < amount) {
      throw new HttpException('Insufficient balance', HttpStatus.PAYMENT_REQUIRED);
    }
    return balance - amount + payout;
  }

  /**
   * Within a Prisma transaction: locks the user row, validates funds, updates balance.
   * Returns { balanceBefore, balanceAfter }.
   */
  async lockAndApply(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: bigint,
    payout: bigint,
  ): Promise<{ balanceBefore: bigint; balanceAfter: bigint }> {
    const rows = await tx.$queryRaw<{ balance: bigint }[]>`
      SELECT balance FROM "User" WHERE id = ${userId} FOR UPDATE
    `;
    if (rows.length === 0) throw new BadRequestException('User not found');
    const balanceBefore = rows[0].balance;
    const balanceAfter = this.computeBalanceAfter(balanceBefore, amount, payout);
    await tx.user.update({ where: { id: userId }, data: { balance: balanceAfter } });
    return { balanceBefore, balanceAfter };
  }
}
```

`src/wallet/wallet.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { WalletService } from './wallet.service';

@Module({ providers: [WalletService], exports: [WalletService] })
export class WalletModule {}
```

- [ ] **Step 4: Run unit tests, expect PASS**

```bash
npm test -- wallet.service.spec
```

- [ ] **Step 5: Commit**

```bash
git add src/wallet
git commit -m "feat(wallet): atomic balance debit/credit with row-level lock"
```

---

## Task 7: Seeds service (provably-fair lifecycle)

**Files:**
- Create: `src/seeds/seeds.service.ts`, `src/seeds/seeds.module.ts`, `src/seeds/dto/update-client-seed.dto.ts`, `src/seeds/dto/rotate-seed.dto.ts`, `src/seeds/seeds.service.spec.ts`

- [ ] **Step 1: Write unit tests for the pure helpers**

`src/seeds/seeds.service.spec.ts`:
```ts
import { hashServerSeed, randomServerSeed, randomClientSeed } from './seeds.service';

describe('seeds helpers', () => {
  it('hashServerSeed returns 64-char hex sha256', () => {
    const h = hashServerSeed('a'.repeat(64));
    expect(h).toMatch(/^[a-f0-9]{64}$/);
  });

  it('randomServerSeed returns 64 hex chars', () => {
    expect(randomServerSeed()).toMatch(/^[a-f0-9]{64}$/);
  });

  it('randomClientSeed returns 32 hex chars', () => {
    expect(randomClientSeed()).toMatch(/^[a-f0-9]{32}$/);
  });
});
```

- [ ] **Step 2: Run, expect failure**

```bash
npm test -- seeds.service.spec
```

- [ ] **Step 3: Implement `src/seeds/seeds.service.ts`**

```ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Seed, SeedStatus } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export const randomServerSeed = () => randomBytes(32).toString('hex');
export const randomClientSeed = () => randomBytes(16).toString('hex');
export const hashServerSeed = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class SeedsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForUser(
    tx: Prisma.TransactionClient | PrismaService,
    userId: string,
    clientSeed?: string,
  ): Promise<Seed> {
    const serverSeed = randomServerSeed();
    return tx.seed.create({
      data: {
        userId,
        serverSeed,
        serverSeedHash: hashServerSeed(serverSeed),
        clientSeed: clientSeed?.trim() || randomClientSeed(),
      },
    });
  }

  async getActiveForUser(userId: string): Promise<{
    serverSeedHash: string;
    clientSeed: string;
    nonce: number;
  }> {
    const s = await this.prisma.seed.findFirst({
      where: { userId, status: SeedStatus.ACTIVE },
    });
    if (!s) throw new NotFoundException('No active seed');
    return { serverSeedHash: s.serverSeedHash, clientSeed: s.clientSeed, nonce: s.nonce };
  }

  /** Used inside POST /bets transaction. Locks the row, returns it; caller advances nonce. */
  async lockActiveForUpdate(tx: Prisma.TransactionClient, userId: string): Promise<Seed> {
    const rows = await tx.$queryRaw<Seed[]>`
      SELECT * FROM "Seed"
      WHERE "userId" = ${userId} AND status = 'ACTIVE'
      FOR UPDATE
    `;
    if (rows.length === 0) throw new BadRequestException('No active seed');
    return rows[0];
  }

  async advanceNonce(tx: Prisma.TransactionClient, seedId: string, newNonce: number): Promise<void> {
    await tx.seed.update({ where: { id: seedId }, data: { nonce: newNonce } });
  }

  async updateClientSeed(userId: string, clientSeed: string): Promise<void> {
    const active = await this.prisma.seed.findFirst({
      where: { userId, status: SeedStatus.ACTIVE },
    });
    if (!active) throw new NotFoundException('No active seed');
    if (active.nonce !== 0) {
      throw new BadRequestException('Cannot change client seed after first bet; rotate instead');
    }
    await this.prisma.seed.update({
      where: { id: active.id },
      data: { clientSeed: clientSeed.trim() },
    });
  }

  /** Reveals current ACTIVE seed and creates a new one. Returns revealed seed (with raw serverSeed). */
  async rotate(userId: string, newClientSeed?: string): Promise<{
    revealed: { id: string; serverSeed: string; serverSeedHash: string; clientSeed: string; nonceMax: number };
    newActive: { serverSeedHash: string; clientSeed: string; nonce: number };
  }> {
    return this.prisma.$transaction(async tx => {
      const active = await tx.seed.findFirst({ where: { userId, status: SeedStatus.ACTIVE } });
      if (!active) throw new NotFoundException('No active seed');

      await tx.seed.update({
        where: { id: active.id },
        data: { status: SeedStatus.REVEALED, revealedAt: new Date() },
      });

      const fresh = await this.createForUser(tx, userId, newClientSeed);

      return {
        revealed: {
          id: active.id,
          serverSeed: active.serverSeed,
          serverSeedHash: active.serverSeedHash,
          clientSeed: active.clientSeed,
          nonceMax: active.nonce,
        },
        newActive: {
          serverSeedHash: fresh.serverSeedHash,
          clientSeed: fresh.clientSeed,
          nonce: fresh.nonce,
        },
      };
    });
  }

  async reveal(userId: string, seedId: string) {
    const s = await this.prisma.seed.findFirst({ where: { id: seedId, userId } });
    if (!s) throw new NotFoundException('Seed not found');
    if (s.status !== SeedStatus.REVEALED) {
      throw new BadRequestException('Seed is still ACTIVE; rotate before revealing');
    }
    return {
      id: s.id,
      serverSeed: s.serverSeed,
      serverSeedHash: s.serverSeedHash,
      clientSeed: s.clientSeed,
      nonceMax: s.nonce,
    };
  }
}
```

`src/seeds/dto/update-client-seed.dto.ts`:
```ts
import { IsString, Length } from 'class-validator';

export class UpdateClientSeedDto {
  @IsString() @Length(1, 64)
  clientSeed!: string;
}
```

`src/seeds/dto/rotate-seed.dto.ts`:
```ts
import { IsOptional, IsString, Length } from 'class-validator';

export class RotateSeedDto {
  @IsOptional() @IsString() @Length(1, 64)
  newClientSeed?: string;
}
```

`src/seeds/seeds.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { SeedsService } from './seeds.service';

@Module({ providers: [SeedsService], exports: [SeedsService] })
export class SeedsModule {}
```

- [ ] **Step 4: Run unit tests, expect PASS**

```bash
npm test -- seeds.service.spec
```

- [ ] **Step 5: Commit**

```bash
git add src/seeds
git commit -m "feat(seeds): provably-fair seed lifecycle (create/lock/advance/rotate/reveal)"
```

---

## Task 8: Auth helpers (password hashing + token signing)

**Files:**
- Create: `src/auth/password.ts`, `src/auth/tokens.ts`, `src/auth/types.ts`, `src/auth/password.spec.ts`, `src/auth/tokens.spec.ts`

- [ ] **Step 1: Password helper tests**

`src/auth/password.spec.ts`:
```ts
import { hashPassword, verifyPassword } from './password';

describe('password helpers', () => {
  it('hashes and verifies correctly', async () => {
    const h = await hashPassword('hunter22');
    expect(h).not.toBe('hunter22');
    expect(await verifyPassword('hunter22', h)).toBe(true);
    expect(await verifyPassword('wrong', h)).toBe(false);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
npm test -- password.spec
```

- [ ] **Step 3: Implement `src/auth/password.ts`**

```ts
import * as bcrypt from 'bcrypt';

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}
```

- [ ] **Step 4: Token helper tests**

`src/auth/tokens.spec.ts`:
```ts
import { sha256 } from './tokens';

describe('tokens.sha256', () => {
  it('produces deterministic 64-char hex', () => {
    const a = sha256('abc');
    const b = sha256('abc');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });
});
```

- [ ] **Step 5: Implement `src/auth/tokens.ts` and `src/auth/types.ts`**

`src/auth/types.ts`:
```ts
export interface JwtAccessPayload {
  sub: string;
  type: 'access';
}
export interface JwtRefreshPayload {
  sub: string;
  type: 'refresh';
  jti: string;
}
export interface AuthUser {
  id: string;
}
```

`src/auth/tokens.ts`:
```ts
import { createHash, randomUUID } from 'crypto';
export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const newJti = () => randomUUID();
```

- [ ] **Step 6: Run both spec files**

```bash
npm test -- password.spec tokens.spec
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/auth
git commit -m "feat(auth): password hashing and token helpers"
```

---

## Task 9: Users module + auth service (register/login/refresh/logout)

**Files:**
- Create: `src/users/users.service.ts`, `src/users/users.module.ts`, `src/auth/auth.service.ts`, `src/auth/auth.module.ts`, `src/auth/dto/{register,login,refresh,logout}.dto.ts`, `src/auth/jwt-access.strategy.ts`, `src/auth/jwt-access.guard.ts`

- [ ] **Step 1: Implement `src/users/users.service.ts`**

```ts
import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SeedsService } from '../seeds/seeds.service';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seeds: SeedsService,
  ) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /** Creates a user AND their initial ACTIVE seed in one transaction. */
  async createWithSeed(email: string, passwordHash: string): Promise<User> {
    return this.prisma.$transaction(async tx => {
      const user = await tx.user.create({ data: { email, passwordHash } });
      await this.seeds.createForUser(tx as unknown as Prisma.TransactionClient, user.id);
      return user;
    });
  }
}
```

`src/users/users.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { SeedsModule } from '../seeds/seeds.module';
import { UsersService } from './users.service';

@Module({ imports: [SeedsModule], providers: [UsersService], exports: [UsersService] })
export class UsersModule {}
```

- [ ] **Step 2: DTOs**

`src/auth/dto/register.dto.ts`:
```ts
import { IsEmail, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail() email!: string;

  @MinLength(8)
  @Matches(/(?=.*[A-Za-z])(?=.*\d)/, { message: 'password must contain a letter and a digit' })
  password!: string;
}
```

`src/auth/dto/login.dto.ts`:
```ts
import { IsEmail, IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail() email!: string;
  @IsString() @MinLength(1) password!: string;
}
```

`src/auth/dto/refresh.dto.ts`:
```ts
import { IsString, MinLength } from 'class-validator';
export class RefreshDto { @IsString() @MinLength(10) refreshToken!: string; }
```

`src/auth/dto/logout.dto.ts`:
```ts
import { IsString, MinLength } from 'class-validator';
export class LogoutDto { @IsString() @MinLength(10) refreshToken!: string; }
```

- [ ] **Step 3: Implement `src/auth/auth.service.ts`**

```ts
import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { addDuration } from './duration';
import { JwtAccessPayload, JwtRefreshPayload } from './types';
import { hashPassword, verifyPassword } from './password';
import { newJti, sha256 } from './tokens';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
  ) {}

  async register(email: string, password: string) {
    if (await this.users.findByEmail(email)) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await hashPassword(password);
    const user = await this.users.createWithSeed(email, passwordHash);
    const tokens = await this.issueTokens(user.id);
    return { user: { id: user.id, email: user.email }, ...tokens };
  }

  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueTokens(user.id);
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefresh(refreshToken);
    const tokenHash = sha256(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(payload.sub);
  }

  async logout(refreshToken: string) {
    const tokenHash = sha256(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(userId: string) {
    const accessPayload: JwtAccessPayload = { sub: userId, type: 'access' };
    const refreshJti = newJti();
    const refreshPayload: JwtRefreshPayload = { sub: userId, type: 'refresh', jti: refreshJti };

    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.cfg.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.cfg.getOrThrow<string>('JWT_ACCESS_TTL'),
    });
    const refreshTtl = this.cfg.getOrThrow<string>('JWT_REFRESH_TTL');
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.cfg.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshTtl,
    });

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(refreshToken),
        expiresAt: addDuration(new Date(), refreshTtl),
      },
    });

    return { accessToken, refreshToken };
  }

  private async verifyRefresh(token: string): Promise<JwtRefreshPayload> {
    try {
      const payload = await this.jwt.verifyAsync<JwtRefreshPayload>(token, {
        secret: this.cfg.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      if (payload.type !== 'refresh') throw new Error('wrong type');
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
```

`src/auth/duration.ts` (small helper for parsing `15m` / `7d` / `1h`):
```ts
export function addDuration(from: Date, expr: string): Date {
  const m = /^(\d+)([smhd])$/.exec(expr.trim());
  if (!m) throw new Error(`Invalid duration: ${expr}`);
  const n = Number(m[1]);
  const unit = m[2];
  const ms = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unit as 's'|'m'|'h'|'d'];
  return new Date(from.getTime() + n * ms);
}
```

- [ ] **Step 4: Unit test for `addDuration`**

`src/auth/duration.spec.ts`:
```ts
import { addDuration } from './duration';

describe('addDuration', () => {
  const base = new Date('2026-01-01T00:00:00Z');
  it.each([
    ['15m', 15 * 60 * 1000],
    ['7d', 7 * 86400 * 1000],
    ['2h', 2 * 3600 * 1000],
    ['30s', 30 * 1000],
  ])('parses %s', (expr, expected) => {
    expect(addDuration(base, expr).getTime() - base.getTime()).toBe(expected);
  });

  it('throws on invalid', () => {
    expect(() => addDuration(base, 'oops')).toThrow();
  });
});
```

```bash
npm test -- duration.spec
```

Expected: PASS.

- [ ] **Step 5: JWT access strategy + guard**

`src/auth/jwt-access.strategy.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser, JwtAccessPayload } from './types';

@Injectable()
export class JwtAccessStrategy extends PassportStrategy(Strategy, 'jwt-access') {
  constructor(cfg: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: cfg.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }
  validate(payload: JwtAccessPayload): AuthUser {
    if (payload.type !== 'access') throw new Error('Wrong token type');
    return { id: payload.sub };
  }
}
```

`src/auth/jwt-access.guard.ts`:
```ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAccessGuard extends AuthGuard('jwt-access') {}
```

- [ ] **Step 6: Wire `AuthModule`**

`src/auth/auth.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAccessStrategy } from './jwt-access.strategy';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [UsersModule, PassportModule, JwtModule.register({})],
  controllers: [AuthController],
  providers: [AuthService, JwtAccessStrategy],
  exports: [JwtAccessStrategy],
})
export class AuthModule {}
```

(Controller file is created in next step.)

- [ ] **Step 7: Commit**

```bash
git add src/users src/auth
git commit -m "feat(auth): users service, auth service, JWT strategy/guard"
```

---

## Task 10: Auth + Users controllers (HTTP endpoints)

**Files:**
- Create: `src/auth/auth.controller.ts`, `src/users/users.controller.ts`, `src/users/dto/user.response.ts`, decorator `src/auth/current-user.decorator.ts`

- [ ] **Step 1: Implement `CurrentUser` decorator**

`src/auth/current-user.decorator.ts`:
```ts
import { ExecutionContext, createParamDecorator } from '@nestjs/common';
import { AuthUser } from './types';

export const CurrentUser = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AuthUser => ctx.switchToHttp().getRequest().user,
);
```

- [ ] **Step 2: Implement `src/auth/auth.controller.ts`**

```ts
import { Body, Controller, HttpCode, HttpStatus, Post, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { LogoutDto } from './dto/logout.dto';
import { JwtAccessGuard } from './jwt-access.guard';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.auth.register(dto.email, dto.password);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  refresh(@Body() dto: RefreshDto) {
    return this.auth.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAccessGuard)
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Body() dto: LogoutDto) {
    await this.auth.logout(dto.refreshToken);
  }
}
```

- [ ] **Step 3: Implement `src/users/users.controller.ts`**

```ts
import { Controller, Get, NotFoundException, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/jwt-access.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/types';
import { UsersService } from './users.service';

@Controller('users')
@UseGuards(JwtAccessGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@CurrentUser() u: AuthUser) {
    const user = await this.users.findById(u.id);
    if (!user) throw new NotFoundException('User not found');
    return {
      id: user.id,
      email: user.email,
      balance: user.balance,
      createdAt: user.createdAt,
    };
  }
}
```

Add `UsersController` to `UsersModule.controllers`.

- [ ] **Step 4: Register modules in `AppModule`**

```ts
import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SeedsModule } from './seeds/seeds.module';
import { WalletModule } from './wallet/wallet.module';
import { GameModule } from './game/game.module';

@Module({
  imports: [
    ConfigModule, PrismaModule, CommonModule,
    AuthModule, UsersModule, SeedsModule, WalletModule, GameModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 5: e2e test for auth flow**

`test/e2e/auth.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { BigIntInterceptor } from '../../src/common/interceptors/bigint.interceptor';

describe('Auth (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalInterceptors(new BigIntInterceptor());
    await app.init();
  });

  afterAll(async () => app.close());

  const email = `u_${Date.now()}@test.local`;
  let access = '';
  let refresh = '';

  it('registers', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'hunter22' })
      .expect(201);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.refreshToken).toBeDefined();
    access = res.body.accessToken;
    refresh = res.body.refreshToken;
  });

  it('rejects duplicate email', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'hunter22' })
      .expect(409);
  });

  it('GET /users/me works with access token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);
    expect(res.body.email).toBe(email);
    expect(res.body.balance).toBe('0');
  });

  it('refresh rotates tokens', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: refresh })
      .expect(200);
    expect(res.body.refreshToken).not.toBe(refresh);

    // old refresh now revoked
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: refresh })
      .expect(401);
  });
});
```

`jest.e2e.config.ts`:
```ts
import type { Config } from 'jest';
const config: Config = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/e2e/.*\\.e2e-spec\\.ts$',
  transform: { '^.+\\.(t|j)s$': 'ts-jest' },
  testEnvironment: 'node',
};
export default config;
```

- [ ] **Step 6: Run e2e**

```bash
docker compose up -d
npm run prisma:migrate
npm run test:e2e
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/auth src/users src/app.module.ts test/e2e/auth.e2e-spec.ts jest.e2e.config.ts
git commit -m "feat(auth,users): controllers and e2e for register/login/refresh/me"
```

---

## Task 11: Bets service + controller (POST /bets transaction)

**Files:**
- Create: `src/bets/bets.service.ts`, `src/bets/bets.controller.ts`, `src/bets/bets.module.ts`, `src/bets/dto/create-bet.dto.ts`, `src/bets/dto/list-bets.query.ts`

- [ ] **Step 1: DTOs**

`src/bets/dto/create-bet.dto.ts`:
```ts
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, Max, Min } from 'class-validator';
import { MAX_ROWS, MIN_ROWS, Risk } from '../../game/types';

export class CreateBetDto {
  @Transform(({ value }) => BigInt(value))
  amount!: bigint;

  @IsInt() @Min(MIN_ROWS) @Max(MAX_ROWS)
  rows!: number;

  @IsEnum(['LOW', 'MEDIUM', 'HIGH'])
  risk!: Risk;
}
```

`src/bets/dto/list-bets.query.ts`:
```ts
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { MAX_ROWS, MIN_ROWS, Risk } from '../../game/types';

export class ListBetsQuery {
  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt() @Min(1) @Max(100)
  limit?: number = 20;

  @IsOptional() @IsString()
  cursor?: string;

  @IsOptional() @IsEnum(['LOW', 'MEDIUM', 'HIGH'])
  risk?: Risk;

  @IsOptional()
  @Transform(({ value }) => parseInt(value, 10))
  @IsInt() @Min(MIN_ROWS) @Max(MAX_ROWS)
  rows?: number;
}
```

- [ ] **Step 2: Implement `src/bets/bets.service.ts`**

```ts
import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bet, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SeedsService } from '../seeds/seeds.service';
import { WalletService } from '../wallet/wallet.service';
import { play } from '../game/engine';
import { Risk } from '../game/types';

@Injectable()
export class BetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seeds: SeedsService,
    private readonly wallet: WalletService,
    private readonly cfg: ConfigService,
  ) {}

  async placeBet(userId: string, amount: bigint, rows: number, risk: Risk) {
    const minBet = this.cfg.getOrThrow<bigint>('MIN_BET');
    const maxBet = this.cfg.getOrThrow<bigint>('MAX_BET');
    if (amount < minBet || amount > maxBet) {
      throw new BadRequestException(`amount must be between ${minBet} and ${maxBet}`);
    }

    return this.prisma.$transaction(async tx => {
      const seed = await this.seeds.lockActiveForUpdate(tx, userId);
      const nonceAtBet = seed.nonce;
      const result = play(seed.serverSeed, seed.clientSeed, nonceAtBet, rows, risk);
      const payout = this.wallet.computePayout(amount, result.multiplier);
      const { balanceAfter } = await this.wallet.lockAndApply(tx, userId, amount, payout);
      await this.seeds.advanceNonce(tx, seed.id, nonceAtBet + 1);

      const bet = await tx.bet.create({
        data: {
          userId,
          seedId: seed.id,
          nonce: nonceAtBet,
          amount,
          rows,
          risk,
          path: result.path.join(''),
          bucketIndex: result.bucketIndex,
          multiplier: new Prisma.Decimal(result.multiplier),
          payout,
          balanceAfter,
        },
      });

      return {
        betId: bet.id,
        amount: bet.amount,
        rows: bet.rows,
        risk: bet.risk,
        path: bet.path,
        bucketIndex: bet.bucketIndex,
        multiplier: bet.multiplier.toString(),
        payout: bet.payout,
        balanceAfter: bet.balanceAfter,
        seed: {
          serverSeedHash: seed.serverSeedHash,
          clientSeed: seed.clientSeed,
          nonce: nonceAtBet,
        },
      };
    });
  }

  async list(userId: string, q: { limit?: number; cursor?: string; risk?: Risk; rows?: number }) {
    const limit = q.limit ?? 20;
    const where: Prisma.BetWhereInput = { userId };
    if (q.risk) where.risk = q.risk;
    if (q.rows) where.rows = q.rows;

    const items = await this.prisma.bet.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return {
      items: page.map(b => this.serialize(b)),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async getById(userId: string, betId: string) {
    const b = await this.prisma.bet.findUnique({ where: { id: betId } });
    if (!b) throw new NotFoundException('Bet not found');
    if (b.userId !== userId) throw new ForbiddenException();
    return this.serialize(b);
  }

  private serialize(b: Bet) {
    return {
      betId: b.id,
      amount: b.amount,
      rows: b.rows,
      risk: b.risk,
      path: b.path,
      bucketIndex: b.bucketIndex,
      multiplier: b.multiplier.toString(),
      payout: b.payout,
      balanceAfter: b.balanceAfter,
      createdAt: b.createdAt,
    };
  }
}
```

- [ ] **Step 3: Implement `src/bets/bets.controller.ts`**

```ts
import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/jwt-access.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/types';
import { BetsService } from './bets.service';
import { CreateBetDto } from './dto/create-bet.dto';
import { ListBetsQuery } from './dto/list-bets.query';

@Controller('bets')
@UseGuards(JwtAccessGuard)
export class BetsController {
  constructor(private readonly bets: BetsService) {}

  @Post()
  place(@CurrentUser() u: AuthUser, @Body() dto: CreateBetDto) {
    return this.bets.placeBet(u.id, dto.amount, dto.rows, dto.risk);
  }

  @Get()
  list(@CurrentUser() u: AuthUser, @Query() q: ListBetsQuery) {
    return this.bets.list(u.id, q);
  }

  @Get(':id')
  getOne(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.bets.getById(u.id, id);
  }
}
```

- [ ] **Step 4: `src/bets/bets.module.ts`**

```ts
import { Module } from '@nestjs/common';
import { BetsController } from './bets.controller';
import { BetsService } from './bets.service';
import { SeedsModule } from '../seeds/seeds.module';
import { WalletModule } from '../wallet/wallet.module';

@Module({
  imports: [SeedsModule, WalletModule],
  controllers: [BetsController],
  providers: [BetsService],
})
export class BetsModule {}
```

Add `BetsModule` to `AppModule.imports`.

- [ ] **Step 5: e2e — bets happy path**

`test/e2e/bets.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { BigIntInterceptor } from '../../src/common/interceptors/bigint.interceptor';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Bets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let access = '';
  let userId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalInterceptors(new BigIntInterceptor());
    await app.init();
    prisma = app.get(PrismaService);

    const email = `bets_${Date.now()}@t.local`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'hunter22' });
    access = reg.body.accessToken;
    userId = reg.body.user.id;

    // Top up balance directly via Prisma (no top-up endpoint in MVP).
    await prisma.user.update({ where: { id: userId }, data: { balance: 10_000_000_000n } });
  });

  afterAll(async () => app.close());

  it('rejects bet below MIN_BET', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/bets')
      .set('Authorization', `Bearer ${access}`)
      .send({ amount: '1', rows: 10, risk: 'HIGH' })
      .expect(400);
  });

  it('places a bet and returns deterministic fields', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/bets')
      .set('Authorization', `Bearer ${access}`)
      .send({ amount: '1000000', rows: 10, risk: 'HIGH' })
      .expect(201);
    expect(res.body.path).toHaveLength(10);
    expect(res.body.bucketIndex).toBeGreaterThanOrEqual(0);
    expect(res.body.bucketIndex).toBeLessThanOrEqual(10);
    expect(BigInt(res.body.balanceAfter)).toBeLessThan(10_000_000_000n);
  });

  it('rejects bet with insufficient balance', async () => {
    await prisma.user.update({ where: { id: userId }, data: { balance: 0n } });
    await request(app.getHttpServer())
      .post('/api/v1/bets')
      .set('Authorization', `Bearer ${access}`)
      .send({ amount: '1000000', rows: 10, risk: 'HIGH' })
      .expect(402);
  });

  it('lists history with filters and pagination', async () => {
    await prisma.user.update({ where: { id: userId }, data: { balance: 100_000_000_000n } });
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/bets')
        .set('Authorization', `Bearer ${access}`)
        .send({ amount: '1000000', rows: 10, risk: 'HIGH' });
    }
    const res = await request(app.getHttpServer())
      .get('/api/v1/bets?limit=2&risk=HIGH&rows=10')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.nextCursor).toBeDefined();
  });
});
```

- [ ] **Step 6: Run e2e**

```bash
npm run test:e2e -- bets.e2e-spec
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/bets src/app.module.ts test/e2e/bets.e2e-spec.ts
git commit -m "feat(bets): place/list/get bet endpoints with transactional payout"
```

---

## Task 12: Seeds controller (provably-fair endpoints)

**Files:**
- Create: `src/seeds/seeds.controller.ts`; modify `src/seeds/seeds.module.ts`

- [ ] **Step 1: Implement `src/seeds/seeds.controller.ts`**

```ts
import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAccessGuard } from '../auth/jwt-access.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { AuthUser } from '../auth/types';
import { SeedsService } from './seeds.service';
import { UpdateClientSeedDto } from './dto/update-client-seed.dto';
import { RotateSeedDto } from './dto/rotate-seed.dto';

@Controller('seeds')
@UseGuards(JwtAccessGuard)
export class SeedsController {
  constructor(private readonly seeds: SeedsService) {}

  @Get('active')
  active(@CurrentUser() u: AuthUser) {
    return this.seeds.getActiveForUser(u.id);
  }

  @Post('client')
  @HttpCode(HttpStatus.NO_CONTENT)
  async updateClient(@CurrentUser() u: AuthUser, @Body() dto: UpdateClientSeedDto) {
    await this.seeds.updateClientSeed(u.id, dto.clientSeed);
  }

  @Post('rotate')
  rotate(@CurrentUser() u: AuthUser, @Body() dto: RotateSeedDto) {
    return this.seeds.rotate(u.id, dto.newClientSeed);
  }

  @Get(':id')
  reveal(@CurrentUser() u: AuthUser, @Param('id') id: string) {
    return this.seeds.reveal(u.id, id);
  }
}
```

- [ ] **Step 2: Update module**

```ts
import { Module } from '@nestjs/common';
import { SeedsController } from './seeds.controller';
import { SeedsService } from './seeds.service';

@Module({ controllers: [SeedsController], providers: [SeedsService], exports: [SeedsService] })
export class SeedsModule {}
```

- [ ] **Step 3: e2e for seeds lifecycle**

`test/e2e/seeds.e2e-spec.ts`:
```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { createHash, createHmac } from 'crypto';
import { AppModule } from '../../src/app.module';
import { BigIntInterceptor } from '../../src/common/interceptors/bigint.interceptor';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Seeds (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let access = '';
  let userId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalInterceptors(new BigIntInterceptor());
    await app.init();
    prisma = app.get(PrismaService);

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `seeds_${Date.now()}@t.local`, password: 'hunter22' });
    access = reg.body.accessToken;
    userId = reg.body.user.id;
    await prisma.user.update({ where: { id: userId }, data: { balance: 10_000_000_000n } });
  });

  afterAll(async () => app.close());

  it('player can update client seed at nonce=0', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/seeds/client')
      .set('Authorization', `Bearer ${access}`)
      .send({ clientSeed: 'mine' })
      .expect(204);
    const active = await request(app.getHttpServer())
      .get('/api/v1/seeds/active')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);
    expect(active.body.clientSeed).toBe('mine');
  });

  it('rotates and reveals — verifies hash and reproduces past bet', async () => {
    // Place one bet so nonce becomes 1
    const bet = await request(app.getHttpServer())
      .post('/api/v1/bets')
      .set('Authorization', `Bearer ${access}`)
      .send({ amount: '1000000', rows: 10, risk: 'HIGH' })
      .expect(201);
    const expectedHash = bet.body.seed.serverSeedHash;
    const usedNonce = bet.body.seed.nonce;
    const usedClient = bet.body.seed.clientSeed;
    const path = bet.body.path;

    const rot = await request(app.getHttpServer())
      .post('/api/v1/seeds/rotate')
      .set('Authorization', `Bearer ${access}`)
      .send({})
      .expect(201);
    const reveal = await request(app.getHttpServer())
      .get(`/api/v1/seeds/${rot.body.revealed.id}`)
      .set('Authorization', `Bearer ${access}`)
      .expect(200);

    // Verify commitment
    expect(createHash('sha256').update(reveal.body.serverSeed).digest('hex')).toBe(expectedHash);

    // Re-run the play algorithm and confirm path matches
    const h = createHmac('sha256', reveal.body.serverSeed).update(`${usedClient}:${usedNonce}`).digest();
    const reconstructed = Array.from(h.slice(0, 10)).map(b => (b < 128 ? 'L' : 'R')).join('');
    expect(reconstructed).toBe(path);
  });

  it('rejects client-seed update after nonce > 0', async () => {
    // After the bet above on the NEW active seed, place one more to push nonce
    await request(app.getHttpServer())
      .post('/api/v1/bets')
      .set('Authorization', `Bearer ${access}`)
      .send({ amount: '1000000', rows: 10, risk: 'HIGH' });
    await request(app.getHttpServer())
      .post('/api/v1/seeds/client')
      .set('Authorization', `Bearer ${access}`)
      .send({ clientSeed: 'late' })
      .expect(400);
  });
});
```

- [ ] **Step 4: Run e2e**

```bash
npm run test:e2e -- seeds.e2e-spec
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/seeds test/e2e/seeds.e2e-spec.ts
git commit -m "feat(seeds): controllers + e2e proof of provably-fair verification"
```

---

## Task 13: Concurrency race-condition test

**Files:**
- Create: `test/e2e/bets-concurrent.e2e-spec.ts`

- [ ] **Step 1: Write the test**

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { BigIntInterceptor } from '../../src/common/interceptors/bigint.interceptor';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Bets concurrency (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let access = '';
  let userId = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalInterceptors(new BigIntInterceptor());
    await app.init();
    prisma = app.get(PrismaService);

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `race_${Date.now()}@t.local`, password: 'hunter22' });
    access = reg.body.accessToken;
    userId = reg.body.user.id;
    await prisma.user.update({ where: { id: userId }, data: { balance: 1_000_000_000_000n } });
  });

  afterAll(async () => app.close());

  it('100 concurrent bets produce 100 unique nonces, no lost balance updates', async () => {
    const promises = Array.from({ length: 100 }).map(() =>
      request(app.getHttpServer())
        .post('/api/v1/bets')
        .set('Authorization', `Bearer ${access}`)
        .send({ amount: '1000000', rows: 10, risk: 'LOW' }),
    );
    const results = await Promise.all(promises);
    const successes = results.filter(r => r.status === 201);
    expect(successes).toHaveLength(100);

    const bets = await prisma.bet.findMany({ where: { userId } });
    const nonces = bets.map(b => b.nonce);
    expect(new Set(nonces).size).toBe(nonces.length); // unique

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const totalIn = 1_000_000n * 100n;
    const totalPayout = bets.reduce((s, b) => s + b.payout, 0n);
    expect(user!.balance).toBe(1_000_000_000_000n - totalIn + totalPayout);
  });
});
```

- [ ] **Step 2: Run**

```bash
npm run test:e2e -- bets-concurrent
```

Expected: PASS (the `FOR UPDATE` lock serialises bets for one user).

- [ ] **Step 3: Commit**

```bash
git add test/e2e/bets-concurrent.e2e-spec.ts
git commit -m "test(bets): concurrent bets stay consistent under row-level lock"
```

---

## Task 14: Pino logger wiring

**Files:**
- Modify: `src/main.ts`, `src/app.module.ts`

- [ ] **Step 1: Wire `nestjs-pino`**

`src/app.module.ts` — add import:
```ts
import { LoggerModule } from 'nestjs-pino';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
        redact: ['req.headers.authorization', 'req.body.password', 'req.body.refreshToken'],
      },
    }),
    // ...existing modules
  ],
})
export class AppModule {}
```

`src/main.ts` — use Pino as Nest logger:
```ts
import { Logger } from 'nestjs-pino';
// inside bootstrap, after create():
app.useLogger(app.get(Logger));
```

- [ ] **Step 2: Smoke test**

```bash
npm run start:dev &
sleep 3
curl -s -X POST localhost:3000/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"log@test.local","password":"hunter22"}' >/dev/null
kill %1
```

Expected: log lines show request without password leakage.

- [ ] **Step 3: Commit**

```bash
git add src/app.module.ts src/main.ts
git commit -m "chore(logging): wire pino with redacted secrets"
```

---

## Task 15: Dockerfile + fly.toml + GitHub Actions

**Files:**
- Create: `Dockerfile`, `.dockerignore`, `fly.toml`, `.github/workflows/ci.yml`, `README.md`

- [ ] **Step 1: Create `.dockerignore`**

```
node_modules
dist
.env
.env.local
.env.test
coverage
docs
.git
```

- [ ] **Step 2: Create `Dockerfile`**

```dockerfile
# ---------- Stage 1: builder ----------
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig*.json nest-cli.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate && npm run build

# ---------- Stage 2: runtime ----------
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

- [ ] **Step 3: Create `fly.toml`**

```toml
app = "plinko-be"
primary_region = "fra"

[build]
  dockerfile = "Dockerfile"

[env]
  NODE_ENV = "production"
  PORT = "3000"

[http_service]
  internal_port = 3000
  force_https = true
  auto_stop_machines = false
  min_machines_running = 1

  [[http_service.checks]]
    interval = "15s"
    timeout = "2s"
    grace_period = "10s"
    method = "GET"
    path = "/health"

[[vm]]
  cpu_kind = "shared"
  cpus = 1
  memory_mb = 512

[deploy]
  release_command = "npx prisma migrate deploy"
```

- [ ] **Step 4: Create `.github/workflows/ci.yml`**

```yaml
name: ci

on:
  pull_request:
  push:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16-alpine
        env:
          POSTGRES_USER: plinko
          POSTGRES_PASSWORD: plinko
          POSTGRES_DB: plinko
        ports: ['5432:5432']
        options: >-
          --health-cmd "pg_isready -U plinko"
          --health-interval 5s
          --health-timeout 5s
          --health-retries 10

    env:
      DATABASE_URL: postgres://plinko:plinko@localhost:5432/plinko
      JWT_ACCESS_SECRET: ${{ '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef' }}
      JWT_REFRESH_SECRET: ${{ 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210' }}
      JWT_ACCESS_TTL: 15m
      JWT_REFRESH_TTL: 7d
      MIN_BET: '1000000'
      MAX_BET: '1000000000000'
      PORT: '3000'
      NODE_ENV: test

    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'npm' }
      - run: npm ci
      - run: npx prisma migrate deploy
      - run: npm run typecheck
      - run: npm test
      - run: npm run test:e2e

  deploy:
    needs: test
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl deploy --remote-only
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

- [ ] **Step 5: Create `README.md`**

```markdown
# plinko-be

NestJS + Prisma + Postgres backend for a Plinko iGaming demo.

## Local dev

```bash
docker compose up -d
cp .env.example .env
npm install
npm run prisma:migrate
npm run start:dev
```

App on http://localhost:3000. Health: `GET /health`. API prefix `/api/v1`.

## Tests

```bash
npm test          # unit
npm run test:e2e  # e2e (requires Postgres)
```

## Deploy

```bash
flyctl launch --no-deploy   # one-time
flyctl postgres create
flyctl postgres attach <pg-app>
flyctl secrets set JWT_ACCESS_SECRET=... JWT_REFRESH_SECRET=... MIN_BET=1000000 MAX_BET=1000000000000 JWT_ACCESS_TTL=15m JWT_REFRESH_TTL=7d
flyctl deploy
```

See spec: `docs/superpowers/specs/2026-05-17-plinko-backend-design.md`.
```

- [ ] **Step 6: Verify Docker build works locally**

```bash
docker build -t plinko-be:dev .
```

Expected: image built successfully.

- [ ] **Step 7: Commit**

```bash
git add Dockerfile .dockerignore fly.toml .github README.md
git commit -m "chore(deploy): Dockerfile, fly.toml, GitHub Actions CI/CD"
```

---

## Task 16: Final wiring + smoke test

**Files:**
- Modify: `src/app.module.ts` (ensure all modules present), `src/main.ts` (final boot)

- [ ] **Step 1: Verify `AppModule` includes every module**

`src/app.module.ts`:
```ts
import { Module } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { ConfigModule } from './config/config.module';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { SeedsModule } from './seeds/seeds.module';
import { WalletModule } from './wallet/wallet.module';
import { GameModule } from './game/game.module';
import { BetsModule } from './bets/bets.module';

@Module({
  imports: [
    LoggerModule.forRoot({
      pinoHttp: {
        level: process.env.LOG_LEVEL ?? 'info',
        transport: process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { colorize: true } }
          : undefined,
        redact: ['req.headers.authorization', 'req.body.password', 'req.body.refreshToken'],
      },
    }),
    ConfigModule,
    PrismaModule,
    CommonModule,
    AuthModule,
    UsersModule,
    SeedsModule,
    WalletModule,
    GameModule,
    BetsModule,
  ],
})
export class AppModule {}
```

- [ ] **Step 2: Run the full test suite**

```bash
npm run typecheck
npm test
npm run test:e2e
```

Expected: all green.

- [ ] **Step 3: Manual smoke test against running server**

```bash
npm run start:dev &
sleep 3
# register
TOKEN=$(curl -s -X POST localhost:3000/api/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"smoke@t.local","password":"hunter22"}' | jq -r .accessToken)

# game config
curl -s localhost:3000/api/v1/game/config | jq '.rows, .risks'

# top up via psql for the demo
docker exec -i $(docker compose ps -q postgres) psql -U plinko -d plinko \
  -c "UPDATE \"User\" SET balance = 10000000000 WHERE email = 'smoke@t.local';"

# place a bet
curl -s -X POST localhost:3000/api/v1/bets \
  -H "authorization: bearer $TOKEN" -H 'content-type: application/json' \
  -d '{"amount":"1000000","rows":10,"risk":"HIGH"}' | jq

# history
curl -s localhost:3000/api/v1/bets -H "authorization: bearer $TOKEN" | jq '.items | length'

kill %1
```

Expected: register returns tokens; bet response includes path/bucketIndex/multiplier/payout/balanceAfter/seed; history returns ≥ 1 item.

- [ ] **Step 4: Commit any final tweaks**

```bash
git add -A
git diff --cached --quiet || git commit -m "chore: final wiring and smoke checks"
```

---

## Self-Review (built-in)

- **Spec coverage:**
  - JWT auth (access + refresh) → Tasks 8–10 ✓
  - Plinko logic + payout tables → Tasks 5 ✓
  - Bet history with filters/cursor → Task 11 ✓
  - Rows selection (8..16) for FE → Task 5 (`GET /game/config`) + DTO validation in Task 11 ✓
  - Risk management (min/max bet only) → Task 11 (in `placeBet`) ✓
  - Game coefficient (multiplier snapshot in `Bet`) → Task 11 ✓
  - Fly.io + Postgres deploy → Task 15 ✓
  - Provably fair → Tasks 7, 12, 13 ✓
- **Placeholders:** none — every test, code block, and command is concrete.
- **Type consistency:** `Risk` defined once in `src/game/types.ts`, reused by DTOs, services, Prisma enum (string-equivalent), and the engine. `PlayResult.path` is `('L'|'R')[]`; stored as `path.join('')` string in DB; reconstructed in the seed e2e test by mapping bytes to L/R the same way.
- **Method-name consistency:** `lockActiveForUpdate` / `advanceNonce` / `getActiveForUser` / `updateClientSeed` / `rotate` / `reveal` — used identically across `SeedsService`, `SeedsController`, `BetsService`. `lockAndApply` / `computePayout` / `computeBalanceAfter` consistent across `WalletService` callers.

---
