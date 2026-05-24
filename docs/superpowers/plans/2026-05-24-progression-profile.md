# Progression and Player Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build authenticated player profiles with nickname/avatar upload plus XP, levels, daily bonus, daily missions, starter missions, and manual reward claims.

**Architecture:** Add `ProfileModule` for identity presentation and avatar storage, and `ProgressionModule` for XP, streaks, missions, and rewards. Keep mission definitions in code for the first release, store per-user progress in Prisma, and integrate mission updates into `BetsService` inside the existing bet transaction.

**Tech Stack:** NestJS 10, Prisma 5, PostgreSQL, class-validator DTOs, Swagger response DTO suffixes, S3-compatible avatar storage via `@aws-sdk/client-s3`, image normalization via `sharp`, Jest unit/e2e tests.

---

## Pre-Flight Rules

Before editing implementation files, read the matching rule docs. In this checkout the rule files are under `.claude/rules/`; if a future checkout restores `.Codex/rules/`, use the same named rule there.

- `src/**/*.controller.ts`, `src/**/*.dto.ts`, `src/**/*.response.ts`, `src/common/**`, `src/main.ts`, `test/e2e/**`: read `.claude/rules/api.md`.
- `src/auth/**`, `src/users/**`, `test/e2e/auth*.e2e-spec.ts`: read `.claude/rules/auth.md`.
- `src/bets/**`, `src/wallet/**`, `src/game/**`, `test/e2e/bets*.e2e-spec.ts`: read `.claude/rules/bets.md`.
- `prisma/schema.prisma`, `prisma/migrations/**`, `src/prisma/**`, `src/**/*.service.ts`: read `.claude/rules/prisma.md`.
- Before committing changes touching `src/`, `test/`, `prisma/`, `Dockerfile`, `fly.toml`, `.github/workflows/`, or agent rules/skills, read `.agents/skills/pre-commit/SKILL.md`.

## File Structure

Create:

- `src/profile/profile.module.ts`: Nest module wiring profile services/controllers.
- `src/profile/profile.controller.ts`: `GET /profile/me`, `PATCH /profile/me`, `POST /profile/avatar`.
- `src/profile/profile.service.ts`: profile row creation, nickname validation/updates, aggregate response assembly.
- `src/profile/nickname.ts`: pure nickname normalization and validation helpers.
- `src/profile/avatar-storage.service.ts`: S3-compatible upload of normalized WebP avatar bytes.
- `src/profile/dto/profile.response.ts`: Swagger-visible profile aggregate response classes.
- `src/profile/dto/update-profile.dto.ts`: nickname update DTO.
- `src/profile/dto/avatar-upload.response.ts`: response alias/class for upload.
- `src/profile/nickname.spec.ts`: pure nickname helper tests.
- `src/profile/profile.service.spec.ts`: unit tests for default nickname creation and duplicate handling.
- `test/e2e/profile.e2e-spec.ts`: profile read/update/avatar upload e2e coverage.
- `src/progression/progression.module.ts`: Nest module wiring progression services/controllers.
- `src/progression/progression.controller.ts`: `GET /progression/me`, daily claim, mission claim.
- `src/progression/progression.service.ts`: aggregate read, lazy progress creation, reward transactions, bet progress recording.
- `src/progression/level-curve.ts`: pure XP/level helpers.
- `src/progression/mission-definitions.ts`: daily/starter mission definitions and deterministic daily selection.
- `src/progression/types.ts`: internal progression event and mission metadata types.
- `src/progression/dto/progression.response.ts`: Swagger-visible progression response classes.
- `src/progression/dto/claim-reward.response.ts`: claim response DTO classes.
- `src/progression/level-curve.spec.ts`: level curve tests.
- `src/progression/mission-definitions.spec.ts`: deterministic mission selection tests.
- `src/progression/progression.service.spec.ts`: claim and progress update unit tests.
- `test/e2e/progression.e2e-spec.ts`: daily claim, mission progress, mission claim e2e coverage.

Modify:

- `package.json`, `package-lock.json`: add `@aws-sdk/client-s3`, `sharp`, and `@types/multer`.
- `.env.example`: document avatar storage variables.
- `prisma/schema.prisma`: add profile/progression models and enums.
- `src/config/env.validation.ts`, `src/config/env.validation.spec.ts`: validate avatar storage environment.
- `src/app.module.ts`: import `ProfileModule` and `ProgressionModule`.
- `src/users/users.service.ts`, `src/users/users.service.spec.ts`: create `UserProfile` and `UserProgress` during registration.
- Auth response files stay unchanged. The frontend reads nickname/avatar through `/profile/me` after registration or login.
- `src/wallet/wallet.service.ts`, `src/wallet/wallet.service.spec.ts`: add transaction-aware reward credit helper.
- `src/bets/bets.module.ts`, `src/bets/bets.service.ts`, `src/bets/dto/bet.response.ts`, `test/e2e/bets.e2e-spec.ts`: record mission progress after bets and return optional progression events.

## Task 1: Dependencies And Environment Contract

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `.env.example`
- Modify: `src/config/env.validation.ts`
- Modify: `src/config/env.validation.spec.ts`

- [ ] **Step 1: Add failing env validation tests**

Add this test case to `src/config/env.validation.spec.ts`:

```ts
it('requires avatar storage configuration', () => {
  const valid = {
    DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
    JWT_ACCESS_SECRET: 'a'.repeat(32),
    JWT_REFRESH_SECRET: 'b'.repeat(32),
    JWT_ACCESS_TTL: '15m',
    JWT_REFRESH_TTL: '7d',
    MIN_BET: '1000000',
    MAX_BET: '1000000000000',
    PORT: '3000',
    NODE_ENV: 'test',
    AVATAR_STORAGE_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
    AVATAR_STORAGE_REGION: 'auto',
    AVATAR_STORAGE_BUCKET: 'plinko-avatars',
    AVATAR_STORAGE_ACCESS_KEY_ID: 'key',
    AVATAR_STORAGE_SECRET_ACCESS_KEY: 'secret',
    AVATAR_PUBLIC_BASE_URL: 'https://cdn.example.com',
  };

  expect(validateEnv(valid).AVATAR_STORAGE_BUCKET).toBe('plinko-avatars');
  expect(() => validateEnv({ ...valid, AVATAR_STORAGE_BUCKET: '' })).toThrow(
    /Env validation failed/,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/config/env.validation.spec.ts -t "requires avatar storage configuration"`

Expected: FAIL because `AVATAR_STORAGE_BUCKET` is not defined on `EnvSchema`.

- [ ] **Step 3: Install avatar dependencies**

Run:

```bash
npm install @aws-sdk/client-s3 sharp
npm install -D @types/multer
```

Expected: `package.json` and `package-lock.json` include the new dependencies.

- [ ] **Step 4: Implement env schema fields**

Add to `EnvSchema` in `src/config/env.validation.ts`:

```ts
  @IsString() @MinLength(1)
  AVATAR_STORAGE_ENDPOINT!: string;

  @IsString() @MinLength(1)
  AVATAR_STORAGE_REGION!: string;

  @IsString() @MinLength(1)
  AVATAR_STORAGE_BUCKET!: string;

  @IsString() @MinLength(1)
  AVATAR_STORAGE_ACCESS_KEY_ID!: string;

  @IsString() @MinLength(1)
  AVATAR_STORAGE_SECRET_ACCESS_KEY!: string;

  @IsString() @MinLength(1)
  AVATAR_PUBLIC_BASE_URL!: string;
```

Add to `.env.example`:

```text
AVATAR_STORAGE_ENDPOINT=https://example.r2.cloudflarestorage.com
AVATAR_STORAGE_REGION=auto
AVATAR_STORAGE_BUCKET=plinko-avatars
AVATAR_STORAGE_ACCESS_KEY_ID=replace-me
AVATAR_STORAGE_SECRET_ACCESS_KEY=replace-me
AVATAR_PUBLIC_BASE_URL=https://cdn.example.com
```

- [ ] **Step 5: Run focused verification**

Run: `npm test -- src/config/env.validation.spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json .env.example src/config/env.validation.ts src/config/env.validation.spec.ts
git commit -m "chore(profile): add avatar storage configuration"
```

## Task 2: Prisma Schema And Client

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/<timestamp>_add_profile_progression/migration.sql`

- [ ] **Step 1: Update Prisma schema**

Add these fields to `User`:

```prisma
  profile         UserProfile?
  progress        UserProgress?
  missionProgress UserMissionProgress[]
  rewardLedger    ProgressionRewardLedger[]
```

Add these models/enums after existing enums:

```prisma
model UserProfile {
  userId          String   @id
  nickname        String   @unique
  avatarKey       String?
  avatarUrl       String?
  avatarUpdatedAt DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model UserProgress {
  userId           String   @id
  xp               Int      @default(0)
  level            Int      @default(1)
  dailyStreak      Int      @default(0)
  lastDailyClaimAt DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  user             User     @relation(fields: [userId], references: [id], onDelete: Cascade)
}

model UserMissionProgress {
  id           String        @id @default(uuid())
  userId       String
  missionKey   String
  periodKey    String
  type         MissionType
  target       Int
  progress     Int           @default(0)
  metadata     Json?
  status       MissionStatus @default(ACTIVE)
  creditReward BigInt
  xpReward     Int
  completedAt  DateTime?
  claimedAt    DateTime?
  createdAt    DateTime      @default(now())
  updatedAt    DateTime      @updatedAt

  user         User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, missionKey, periodKey])
  @@index([userId, periodKey])
  @@index([userId, status])
}

model ProgressionRewardLedger {
  id           String       @id @default(uuid())
  userId       String
  source       RewardSource
  sourceKey    String
  periodKey    String
  creditAmount BigInt
  xpAmount     Int
  balanceAfter BigInt
  levelBefore  Int
  levelAfter   Int
  createdAt    DateTime     @default(now())

  user         User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, source, sourceKey, periodKey])
  @@index([userId, createdAt(sort: Desc)])
}

enum MissionType {
  DAILY
  STARTER
}

enum MissionStatus {
  ACTIVE
  COMPLETED
  CLAIMED
}

enum RewardSource {
  DAILY_BONUS
  MISSION
}
```

Every `ProgressionRewardLedger` row must store a concrete `periodKey` so PostgreSQL unique indexes enforce reward idempotency. Use the daily UTC date for daily bonus and daily mission rewards, `starter` for starter mission rewards, and an explicit period key for future reward sources.

- [ ] **Step 2: Generate migration**

Run: `npm run prisma:migrate -- --name add_profile_progression`

Expected: migration SQL creates the four tables, three enums, unique indexes, foreign keys with `ON DELETE CASCADE`, and Prisma client regenerates.

- [ ] **Step 3: Verify generated client and schema**

Run: `npm run prisma:generate`

Expected: PASS with Prisma client generated.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations package-lock.json
git commit -m "feat(progression): add profile and progression schema"
```

## Task 3: Pure Progression And Nickname Helpers

**Files:**
- Create: `src/progression/level-curve.ts`
- Create: `src/progression/level-curve.spec.ts`
- Create: `src/progression/mission-definitions.ts`
- Create: `src/progression/mission-definitions.spec.ts`
- Create: `src/profile/nickname.ts`
- Create: `src/profile/nickname.spec.ts`

- [ ] **Step 1: Write failing pure helper tests**

Create `src/progression/level-curve.spec.ts`:

```ts
import { describeLevel, levelForXp, xpForLevel } from './level-curve';

describe('level curve', () => {
  it('uses a quadratic total XP curve', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(100);
    expect(xpForLevel(3)).toBe(400);
    expect(xpForLevel(4)).toBe(900);
  });

  it('describes XP progress within the current level', () => {
    expect(levelForXp(240)).toBe(2);
    expect(describeLevel(240)).toEqual({
      level: 2,
      xp: 240,
      xpForCurrentLevel: 100,
      xpForNextLevel: 400,
      xpIntoCurrentLevel: 140,
    });
  });
});
```

Create `src/profile/nickname.spec.ts`:

```ts
import { assertValidNickname, defaultNicknameBase } from './nickname';

describe('nickname helpers', () => {
  it('normalizes email prefix into a safe default base', () => {
    expect(defaultNicknameBase('Demo.User+tag@test.local')).toBe('Demo_User_tag');
    expect(defaultNicknameBase('@@@test.local')).toBe('player');
  });

  it('accepts only 3-20 ASCII letters, digits, and underscore', () => {
    expect(() => assertValidNickname('abc_123')).not.toThrow();
    expect(() => assertValidNickname('ab')).toThrow(/3 to 20/);
    expect(() => assertValidNickname('name-with-dash')).toThrow(/letters, digits, and underscore/);
  });
});
```

Create `src/progression/mission-definitions.spec.ts`:

```ts
import { DAILY_MISSION_COUNT, STARTER_MISSIONS, selectDailyMissions } from './mission-definitions';

describe('mission definitions', () => {
  it('selects exactly three deterministic daily missions', () => {
    const first = selectDailyMissions('user-1', '2026-05-24');
    const second = selectDailyMissions('user-1', '2026-05-24');

    expect(first).toEqual(second);
    expect(first).toHaveLength(DAILY_MISSION_COUNT);
    expect(new Set(first.map(m => m.key)).size).toBe(DAILY_MISSION_COUNT);
  });

  it('defines starter missions for onboarding', () => {
    expect(STARTER_MISSIONS.map(m => m.key)).toEqual([
      'first_bet',
      'first_win',
      'try_all_risks',
      'hit_5x',
      'play_25_bets',
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- src/progression/level-curve.spec.ts src/progression/mission-definitions.spec.ts src/profile/nickname.spec.ts`

Expected: FAIL because the helper modules do not exist.

- [ ] **Step 3: Implement helpers**

Create `src/progression/level-curve.ts`:

```ts
export function xpForLevel(level: number): number {
  if (!Number.isInteger(level) || level < 1) throw new Error('level must be a positive integer');
  return level === 1 ? 0 : 100 * (level - 1) * (level - 1);
}

export function levelForXp(xp: number): number {
  if (!Number.isInteger(xp) || xp < 0) throw new Error('xp must be a non-negative integer');
  let level = 1;
  while (xp >= xpForLevel(level + 1)) level += 1;
  return level;
}

export function describeLevel(xp: number) {
  const level = levelForXp(xp);
  return {
    level,
    xp,
    xpForCurrentLevel: xpForLevel(level),
    xpForNextLevel: xpForLevel(level + 1),
    xpIntoCurrentLevel: xp - xpForLevel(level),
  };
}
```

Create `src/profile/nickname.ts`:

```ts
import { BadRequestException } from '@nestjs/common';

const VALID_NICKNAME = /^[A-Za-z0-9_]{3,20}$/;

export function defaultNicknameBase(email: string): string {
  const prefix = email.split('@')[0] ?? '';
  const normalized = prefix.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  const base = normalized || 'player';
  return base.slice(0, 14);
}

export function assertValidNickname(nickname: string): void {
  if (nickname.length < 3 || nickname.length > 20) {
    throw new BadRequestException('nickname must be 3 to 20 characters');
  }
  if (!VALID_NICKNAME.test(nickname)) {
    throw new BadRequestException('nickname may contain only ASCII letters, digits, and underscore');
  }
}
```

Create `src/progression/mission-definitions.ts` with the exact first-release definitions from the spec. Use this shape:

```ts
import { createHash } from 'crypto';
import { Risk } from '../game/types';

export const DAILY_MISSION_COUNT = 3;
export type MissionKind = 'DAILY' | 'STARTER';
export type MissionRule =
  | { kind: 'count_bets' }
  | { kind: 'count_wins' }
  | { kind: 'hit_multiplier'; multiplier: number }
  | { kind: 'count_risk'; risk: Risk }
  | { kind: 'wager_credits' }
  | { kind: 'try_all_risks' };

export type MissionDefinition = {
  key: string;
  type: MissionKind;
  title: string;
  description: string;
  target: number;
  creditReward: bigint;
  xpReward: number;
  rule: MissionRule;
};

const credits = (value: number) => BigInt(value) * 1_000_000n;

export const DAILY_MISSIONS: MissionDefinition[] = [
  { key: 'place_10_bets', type: 'DAILY', title: 'Place 10 bets', description: 'Place 10 bets today.', target: 10, creditReward: credits(500), xpReward: 40, rule: { kind: 'count_bets' } },
  { key: 'win_3_bets', type: 'DAILY', title: 'Win 3 bets', description: 'Finish 3 bets with payout greater than bet amount.', target: 3, creditReward: credits(750), xpReward: 60, rule: { kind: 'count_wins' } },
  { key: 'hit_2x', type: 'DAILY', title: 'Hit 2x', description: 'Land a multiplier of 2x or higher.', target: 1, creditReward: credits(750), xpReward: 60, rule: { kind: 'hit_multiplier', multiplier: 2 } },
  { key: 'play_high_risk_5', type: 'DAILY', title: 'Play high risk 5 times', description: 'Place 5 high-risk bets today.', target: 5, creditReward: credits(600), xpReward: 50, rule: { kind: 'count_risk', risk: 'HIGH' } },
  { key: 'wager_1000_credits', type: 'DAILY', title: 'Wager 1,000 credits', description: 'Wager a total of 1,000 credits today.', target: 1000, creditReward: credits(1500), xpReward: 100, rule: { kind: 'wager_credits' } },
];

export const STARTER_MISSIONS: MissionDefinition[] = [
  { key: 'first_bet', type: 'STARTER', title: 'First bet', description: 'Place your first bet.', target: 1, creditReward: credits(500), xpReward: 50, rule: { kind: 'count_bets' } },
  { key: 'first_win', type: 'STARTER', title: 'First win', description: 'Win your first bet.', target: 1, creditReward: credits(750), xpReward: 75, rule: { kind: 'count_wins' } },
  { key: 'try_all_risks', type: 'STARTER', title: 'Try all risks', description: 'Place a bet on low, medium, and high risk.', target: 3, creditReward: credits(1000), xpReward: 100, rule: { kind: 'try_all_risks' } },
  { key: 'hit_5x', type: 'STARTER', title: 'Hit 5x', description: 'Land a multiplier of 5x or higher.', target: 1, creditReward: credits(1500), xpReward: 150, rule: { kind: 'hit_multiplier', multiplier: 5 } },
  { key: 'play_25_bets', type: 'STARTER', title: 'Play 25 bets', description: 'Place 25 total bets.', target: 25, creditReward: credits(2000), xpReward: 200, rule: { kind: 'count_bets' } },
];

export function selectDailyMissions(userId: string, periodKey: string): MissionDefinition[] {
  return [...DAILY_MISSIONS]
    .sort((a, b) => score(userId, periodKey, a.key).localeCompare(score(userId, periodKey, b.key)))
    .slice(0, DAILY_MISSION_COUNT);
}

function score(userId: string, periodKey: string, missionKey: string): string {
  return createHash('sha256').update(`${userId}:${periodKey}:${missionKey}`).digest('hex');
}
```

- [ ] **Step 4: Run pure tests**

Run: `npm test -- src/progression/level-curve.spec.ts src/progression/mission-definitions.spec.ts src/profile/nickname.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/progression/level-curve.ts src/progression/level-curve.spec.ts src/progression/mission-definitions.ts src/progression/mission-definitions.spec.ts src/profile/nickname.ts src/profile/nickname.spec.ts
git commit -m "feat(progression): add level and mission helpers"
```

## Task 4: Registration Creates Profile And Progress Rows

**Files:**
- Modify: `src/users/users.service.ts`
- Modify: `src/users/users.service.spec.ts`

- [ ] **Step 1: Update failing UsersService test**

In `src/users/users.service.spec.ts`, extend the transaction mock:

```ts
const tx = {
  user: {
    create: jest.fn().mockResolvedValue(user),
  },
  userProfile: {
    create: jest.fn().mockResolvedValue(undefined),
    findUnique: jest.fn().mockResolvedValue(null),
  },
  userProgress: {
    create: jest.fn().mockResolvedValue(undefined),
  },
};
```

Add expectations:

```ts
expect(tx.userProfile.create).toHaveBeenCalledWith({
  data: {
    userId: user.id,
    nickname: expect.stringMatching(/^demo_[A-Za-z0-9]{6}$/),
  },
});
expect(tx.userProgress.create).toHaveBeenCalledWith({
  data: { userId: user.id },
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/users/users.service.spec.ts`

Expected: FAIL because `createWithSeed` does not create profile/progress rows.

- [ ] **Step 3: Implement default profile/progress creation**

In `src/users/users.service.ts`, import `defaultNicknameBase` and `randomBytes`. Add private helper:

```ts
  private async uniqueDefaultNickname(tx: Prisma.TransactionClient, email: string): Promise<string> {
    const base = defaultNicknameBase(email);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = randomBytes(3).toString('hex');
      const nickname = `${base}_${suffix}`.slice(0, 20);
      const existing = await tx.userProfile.findUnique({ where: { nickname } });
      if (!existing) return nickname;
    }
    return `player_${randomBytes(6).toString('hex')}`.slice(0, 20);
  }
```

Inside `createWithSeed`, after the user is created and before returning:

```ts
const nickname = await this.uniqueDefaultNickname(tx as Prisma.TransactionClient, email);
await tx.userProfile.create({ data: { userId: user.id, nickname } });
await tx.userProgress.create({ data: { userId: user.id } });
```

- [ ] **Step 4: Run focused test**

Run: `npm test -- src/users/users.service.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/users/users.service.ts src/users/users.service.spec.ts
git commit -m "feat(profile): create profile on registration"
```

## Task 5: Profile Read And Nickname Update

**Files:**
- Create: `src/profile/profile.module.ts`
- Create: `src/profile/profile.controller.ts`
- Create: `src/profile/profile.service.ts`
- Create: `src/profile/dto/profile.response.ts`
- Create: `src/profile/dto/update-profile.dto.ts`
- Modify: `src/app.module.ts`
- Create: `test/e2e/profile.e2e-spec.ts`

- [ ] **Step 1: Write failing profile e2e tests**

Create `test/e2e/profile.e2e-spec.ts` with:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { BigIntInterceptor } from '../../src/common/interceptors/bigint.interceptor';

describe('Profile (e2e)', () => {
  let app: INestApplication;
  let access = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalInterceptors(new BigIntInterceptor());
    await app.init();

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `profile_${Date.now()}@test.local`, password: 'hunter22' });
    access = reg.body.accessToken;
  });

  afterAll(async () => app.close());

  it('returns the authenticated profile aggregate', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/profile/me')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);

    expect(res.body.email).toContain('@test.local');
    expect(res.body.nickname).toEqual(expect.any(String));
    expect(res.body.avatarUrl).toBeNull();
    expect(res.body.balance).toBe('10000000000');
    expect(res.body.progression.level).toBe(1);
    expect(res.body.progression.dailyStreak).toBe(0);
  });

  it('updates nickname and rejects invalid values', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/profile/me')
      .set('Authorization', `Bearer ${access}`)
      .send({ nickname: 'new_name_123' })
      .expect(200)
      .expect(res => expect(res.body.nickname).toBe('new_name_123'));

    await request(app.getHttpServer())
      .patch('/api/v1/profile/me')
      .set('Authorization', `Bearer ${access}`)
      .send({ nickname: 'bad-name' })
      .expect(400);
  });
});
```

- [ ] **Step 2: Run e2e to verify it fails**

Run: `npm run test:e2e -- profile.e2e-spec.ts`

Expected: FAIL because `/api/v1/profile/me` does not exist.

- [ ] **Step 3: Implement DTOs**

Create `src/profile/dto/update-profile.dto.ts`:

```ts
import { IsString, MaxLength, MinLength, Matches } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Matches(/^[A-Za-z0-9_]+$/)
  nickname!: string;
}
```

Create `src/profile/dto/profile.response.ts` with classes `ProfileProgressionSummary` and `ProfileResponse` exposing `id`, `email`, `nickname`, `avatarUrl`, `balance`, and `progression`.

- [ ] **Step 4: Implement profile service/controller/module**

`ProfileService` constructor:

```ts
constructor(private readonly prisma: PrismaService) {}
```

Public methods:

```ts
getMe(userId: string): Promise<ProfileResponse>
updateMe(userId: string, dto: UpdateProfileDto): Promise<ProfileResponse>
```

`updateMe` must trim nickname, call `assertValidNickname`, catch Prisma unique constraint `P2002`, and throw `ConflictException('Nickname already taken')`.

`ProfileController` routes:

```ts
@Get('me')
getMe(@CurrentUser() u: AuthUser) {
  return this.profile.getMe(u.id);
}

@Patch('me')
updateMe(@CurrentUser() u: AuthUser, @Body() dto: UpdateProfileDto) {
  return this.profile.updateMe(u.id, dto);
}
```

Add `ProfileModule` to `AppModule`.

- [ ] **Step 5: Run focused e2e**

Run: `npm run test:e2e -- profile.e2e-spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/profile src/app.module.ts test/e2e/profile.e2e-spec.ts
git commit -m "feat(profile): expose player profile"
```

## Task 6: Avatar Upload Storage

**Files:**
- Create: `src/profile/avatar-storage.service.ts`
- Create: `src/profile/dto/avatar-upload.response.ts`
- Modify: `src/profile/profile.controller.ts`
- Modify: `src/profile/profile.service.ts`
- Modify: `src/profile/profile.module.ts`
- Modify: `test/e2e/profile.e2e-spec.ts`

- [ ] **Step 1: Add failing avatar e2e tests**

In `test/e2e/profile.e2e-spec.ts`, override `AvatarStorageService` before compiling:

```ts
const avatarStorage = {
  uploadAvatar: jest.fn().mockResolvedValue({
    avatarKey: 'avatars/user/avatar.webp',
    avatarUrl: 'https://cdn.example.com/avatars/user/avatar.webp',
  }),
};

const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
  .overrideProvider(AvatarStorageService)
  .useValue(avatarStorage)
  .compile();
```

Add tests:

```ts
it('uploads an avatar and returns updated profile', async () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  );

  await request(app.getHttpServer())
    .post('/api/v1/profile/avatar')
    .set('Authorization', `Bearer ${access}`)
    .attach('image', png, { filename: 'avatar.png', contentType: 'image/png' })
    .expect(201)
    .expect(res => expect(res.body.avatarUrl).toBe('https://cdn.example.com/avatars/user/avatar.webp'));
});

it('rejects non-image avatar upload', async () => {
  await request(app.getHttpServer())
    .post('/api/v1/profile/avatar')
    .set('Authorization', `Bearer ${access}`)
    .attach('image', Buffer.from('not image'), { filename: 'avatar.txt', contentType: 'text/plain' })
    .expect(400);
});
```

- [ ] **Step 2: Run e2e to verify it fails**

Run: `npm run test:e2e -- profile.e2e-spec.ts`

Expected: FAIL because `AvatarStorageService` and route do not exist.

- [ ] **Step 3: Implement storage service**

Create `AvatarStorageService` with:

```ts
async uploadAvatar(userId: string, image: Buffer): Promise<{ avatarKey: string; avatarUrl: string }> {
  const webp = await sharp(image).resize(256, 256, { fit: 'cover' }).webp({ quality: 82 }).toBuffer();
  const avatarKey = `avatars/${userId}/${randomUUID()}.webp`;
  await this.s3.send(new PutObjectCommand({
    Bucket: this.bucket,
    Key: avatarKey,
    Body: webp,
    ContentType: 'image/webp',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return { avatarKey, avatarUrl: `${this.publicBaseUrl.replace(/\/$/, '')}/${avatarKey}` };
}
```

Constructor reads `AVATAR_STORAGE_*` from `ConfigService` and creates `S3Client`.

- [ ] **Step 4: Implement upload route**

In controller:

```ts
@Post('avatar')
@UseInterceptors(FileInterceptor('image', {
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(new BadRequestException('avatar must be a JPEG, PNG, or WebP image'), false);
      return;
    }
    cb(null, true);
  },
}))
uploadAvatar(@CurrentUser() u: AuthUser, @UploadedFile() file?: Express.Multer.File) {
  if (!file) throw new BadRequestException('avatar image is required');
  return this.profile.uploadAvatar(u.id, file.buffer);
}
```

In service:

```ts
async uploadAvatar(userId: string, image: Buffer) {
  const uploaded = await this.avatarStorage.uploadAvatar(userId, image);
  await this.prisma.userProfile.update({
    where: { userId },
    data: { avatarKey: uploaded.avatarKey, avatarUrl: uploaded.avatarUrl, avatarUpdatedAt: new Date() },
  });
  return this.getMe(userId);
}
```

- [ ] **Step 5: Run focused e2e**

Run: `npm run test:e2e -- profile.e2e-spec.ts`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/profile test/e2e/profile.e2e-spec.ts
git commit -m "feat(profile): support avatar uploads"
```

## Task 7: Progression Aggregate Read

**Files:**
- Create: `src/progression/progression.module.ts`
- Create: `src/progression/progression.controller.ts`
- Create: `src/progression/progression.service.ts`
- Create: `src/progression/types.ts`
- Create: `src/progression/dto/progression.response.ts`
- Modify: `src/app.module.ts`
- Create: `test/e2e/progression.e2e-spec.ts`

- [ ] **Step 1: Write failing progression read e2e**

Create `test/e2e/progression.e2e-spec.ts`:

```ts
import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { BigIntInterceptor } from '../../src/common/interceptors/bigint.interceptor';

describe('Progression (e2e)', () => {
  let app: INestApplication;
  let access = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalInterceptors(new BigIntInterceptor());
    await app.init();

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `progression_${Date.now()}@test.local`, password: 'hunter22' });
    access = reg.body.accessToken;
  });

  afterAll(async () => app.close());

  it('returns level, daily bonus, daily missions, and starter missions', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/progression/me')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);

    expect(res.body.level).toBe(1);
    expect(res.body.xp).toBe(0);
    expect(res.body.daily.canClaim).toBe(true);
    expect(res.body.daily.reward.credits).toBe('500000000');
    expect(res.body.missions.daily).toHaveLength(3);
    expect(res.body.missions.starter.map((m: { key: string }) => m.key)).toContain('first_bet');
  });
});
```

- [ ] **Step 2: Run e2e to verify it fails**

Run: `npm run test:e2e -- progression.e2e-spec.ts`

Expected: FAIL because `/api/v1/progression/me` does not exist.

- [ ] **Step 3: Implement progression aggregate**

`ProgressionService.getMe(userId: string)` must:

1. Upsert `UserProgress`.
2. Ensure today's three daily mission rows exist.
3. Ensure starter mission rows exist.
4. Return `describeLevel(progress.xp)`, daily claim state, and serialized missions.

Use UTC date helpers:

```ts
function periodKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

function nextUtcMidnight(date = new Date()): Date {
  return new Date(`${periodKey(new Date(date.getTime() + 24 * 60 * 60 * 1000))}T00:00:00.000Z`);
}
```

`ProgressionController` route:

```ts
@Get('me')
getMe(@CurrentUser() u: AuthUser) {
  return this.progression.getMe(u.id);
}
```

Add `ProgressionModule` to `AppModule`.

- [ ] **Step 4: Run focused e2e**

Run: `npm run test:e2e -- progression.e2e-spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/progression src/app.module.ts test/e2e/progression.e2e-spec.ts
git commit -m "feat(progression): expose progression aggregate"
```

## Task 8: Wallet Reward Credit Helper

**Files:**
- Modify: `src/wallet/wallet.service.ts`
- Modify: `src/wallet/wallet.service.spec.ts`

- [ ] **Step 1: Write failing wallet test**

Add to `src/wallet/wallet.service.spec.ts`:

```ts
it('credits rewards while holding the user row lock', async () => {
  const service = new WalletService();
  const tx = {
    $queryRaw: jest.fn().mockResolvedValue([{ balance: 1_000_000n }]),
    user: { update: jest.fn().mockResolvedValue(undefined) },
  } as any;

  const result = await service.lockAndCredit(tx, 'user-1', 500_000n);

  expect(result).toEqual({ balanceBefore: 1_000_000n, balanceAfter: 1_500_000n });
  expect(tx.user.update).toHaveBeenCalledWith({
    where: { id: 'user-1' },
    data: { balance: 1_500_000n },
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- src/wallet/wallet.service.spec.ts -t "credits rewards"`

Expected: FAIL because `lockAndCredit` does not exist.

- [ ] **Step 3: Implement helper**

Add to `WalletService`:

```ts
async lockAndCredit(
  tx: Prisma.TransactionClient,
  userId: string,
  creditAmount: bigint,
): Promise<{ balanceBefore: bigint; balanceAfter: bigint }> {
  if (creditAmount < 0n) throw new BadRequestException('creditAmount must be non-negative');
  const rows = await tx.$queryRaw<{ balance: bigint }[]>`
    SELECT balance FROM "User" WHERE id = ${userId} FOR UPDATE
  `;
  if (rows.length === 0) throw new BadRequestException('User not found');
  const balanceBefore = rows[0].balance;
  const balanceAfter = balanceBefore + creditAmount;
  await tx.user.update({ where: { id: userId }, data: { balance: balanceAfter } });
  return { balanceBefore, balanceAfter };
}
```

- [ ] **Step 4: Run wallet tests**

Run: `npm test -- src/wallet/wallet.service.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/wallet/wallet.service.ts src/wallet/wallet.service.spec.ts
git commit -m "feat(wallet): add reward credit helper"
```

## Task 9: Daily Bonus Claim

**Files:**
- Create: `src/progression/dto/claim-reward.response.ts`
- Modify: `src/progression/progression.controller.ts`
- Modify: `src/progression/progression.service.ts`
- Modify: `test/e2e/progression.e2e-spec.ts`

- [ ] **Step 1: Add failing daily claim e2e**

Add to `test/e2e/progression.e2e-spec.ts`:

```ts
it('claims daily bonus once and updates balance and XP', async () => {
  const claim = await request(app.getHttpServer())
    .post('/api/v1/progression/daily/claim')
    .set('Authorization', `Bearer ${access}`)
    .expect(201);

  expect(claim.body.reward.source).toBe('DAILY_BONUS');
  expect(claim.body.reward.credits).toBe('500000000');
  expect(claim.body.reward.xp).toBe(25);
  expect(claim.body.reward.balanceAfter).toBe('10500000000');
  expect(claim.body.progression.xp).toBe(25);
  expect(claim.body.progression.daily.canClaim).toBe(false);

  await request(app.getHttpServer())
    .post('/api/v1/progression/daily/claim')
    .set('Authorization', `Bearer ${access}`)
    .expect(409);
});
```

- [ ] **Step 2: Run e2e to verify it fails**

Run: `npm run test:e2e -- progression.e2e-spec.ts -t "claims daily bonus"`

Expected: FAIL because claim route does not exist.

- [ ] **Step 3: Implement daily claim transaction**

Add controller route:

```ts
@Post('daily/claim')
claimDaily(@CurrentUser() u: AuthUser) {
  return this.progression.claimDaily(u.id);
}
```

`claimDaily` transaction must:

- Lock user row through `wallet.lockAndCredit`.
- Upsert and validate `UserProgress.lastDailyClaimAt`.
- Insert `ProgressionRewardLedger` with `source = DAILY_BONUS`, `sourceKey = periodKey`, `periodKey = periodKey`.
- Add XP, recalculate level using `levelForXp`.
- Set `dailyStreak` and `lastDailyClaimAt`.
- Return reward plus `getMe(userId)` style progression state.

- [ ] **Step 4: Run focused e2e**

Run: `npm run test:e2e -- progression.e2e-spec.ts -t "claims daily bonus"`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/progression test/e2e/progression.e2e-spec.ts
git commit -m "feat(progression): claim daily bonus"
```

## Task 10: Mission Progress And Claim

**Files:**
- Modify: `src/progression/progression.service.ts`
- Modify: `src/progression/progression.service.spec.ts`
- Modify: `src/progression/progression.controller.ts`
- Modify: `test/e2e/progression.e2e-spec.ts`

- [ ] **Step 1: Write failing mission progress unit tests**

Create/extend `src/progression/progression.service.spec.ts` with focused tests around `applyBetToMission` or an exported pure helper:

```ts
expect(applyBetToMission(
  missionFor('place_10_bets', { progress: 9 }),
  { amount: 1_000_000n, payout: 0n, multiplier: 0, risk: 'LOW' },
)).toMatchObject({ progress: 10, status: 'COMPLETED' });

expect(applyBetToMission(
  missionFor('try_all_risks', { progress: 1, metadata: { risks: ['LOW'] } }),
  { amount: 1_000_000n, payout: 0n, multiplier: 0, risk: 'HIGH' },
)).toMatchObject({ progress: 2, metadata: { risks: ['LOW', 'HIGH'] } });
```

- [ ] **Step 2: Run unit test to verify it fails**

Run: `npm test -- src/progression/progression.service.spec.ts`

Expected: FAIL because mission progress helper does not exist.

- [ ] **Step 3: Implement mission progress updates**

Add `recordBet(tx, userId, betLike)`:

```ts
type BetProgressInput = {
  amount: bigint;
  payout: bigint;
  multiplier: number;
  risk: Risk;
};

async recordBet(tx: Prisma.TransactionClient, userId: string, bet: BetProgressInput): Promise<ProgressionEvent[]> {
  await this.ensureMissionRows(tx, userId, new Date());
  const missions = await tx.userMissionProgress.findMany({
    where: { userId, status: { in: ['ACTIVE', 'COMPLETED'] } },
  });
  const events: ProgressionEvent[] = [];
  for (const mission of missions) {
    if (mission.status !== 'ACTIVE') continue;
    const next = applyBetToMission(mission, bet);
    if (next.progress !== mission.progress || JSON.stringify(next.metadata ?? null) !== JSON.stringify(mission.metadata ?? null)) {
      const completed = next.progress >= mission.target;
      await tx.userMissionProgress.update({
        where: { id: mission.id },
        data: {
          progress: Math.min(next.progress, mission.target),
          metadata: next.metadata ?? Prisma.JsonNull,
          status: completed ? 'COMPLETED' : 'ACTIVE',
          completedAt: completed ? new Date() : null,
        },
      });
      events.push(completed
        ? { type: 'MISSION_COMPLETED', missionId: mission.id, key: mission.missionKey }
        : { type: 'MISSION_PROGRESS', missionId: mission.id, progress: next.progress, target: mission.target });
    }
  }
  return events;
}
```

Add mission claim route:

```ts
@Post('missions/:id/claim')
claimMission(@CurrentUser() u: AuthUser, @Param('id') id: string) {
  return this.progression.claimMission(u.id, id);
}
```

`claimMission` validates ownership, `COMPLETED` status, ledger uniqueness, credits balance, adds XP, marks `CLAIMED`.

- [ ] **Step 4: Add failing mission claim e2e**

In e2e, create a completed mission directly with Prisma or place enough bets, then claim:

```ts
const progression = await request(app.getHttpServer())
  .get('/api/v1/progression/me')
  .set('Authorization', `Bearer ${access}`);
const firstBet = progression.body.missions.starter.find((m: { key: string }) => m.key === 'first_bet');

await prisma.userMissionProgress.update({
  where: { id: firstBet.id },
  data: { progress: 1, status: 'COMPLETED', completedAt: new Date() },
});

await request(app.getHttpServer())
  .post(`/api/v1/progression/missions/${firstBet.id}/claim`)
  .set('Authorization', `Bearer ${access}`)
  .expect(201)
  .expect(res => expect(res.body.reward.source).toBe('MISSION'));
```

- [ ] **Step 5: Run progression tests**

Run:

```bash
npm test -- src/progression/progression.service.spec.ts
npm run test:e2e -- progression.e2e-spec.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/progression test/e2e/progression.e2e-spec.ts
git commit -m "feat(progression): track and claim missions"
```

## Task 11: Integrate Progression With Bets

**Files:**
- Modify: `src/bets/bets.module.ts`
- Modify: `src/bets/bets.service.ts`
- Modify: `src/bets/dto/bet.response.ts`
- Modify: `test/e2e/bets.e2e-spec.ts`

- [ ] **Step 1: Add failing bet progression e2e expectation**

In `test/e2e/bets.e2e-spec.ts`, after a successful bet response:

```ts
expect(Array.isArray(res.body.progressionEvents)).toBe(true);
expect(res.body.progressionEvents.some((e: { type: string }) => e.type === 'MISSION_COMPLETED' || e.type === 'MISSION_PROGRESS')).toBe(true);
```

Then fetch progression:

```ts
const progression = await request(app.getHttpServer())
  .get('/api/v1/progression/me')
  .set('Authorization', `Bearer ${access}`)
  .expect(200);
const firstBetMission = progression.body.missions.starter.find((m: { key: string }) => m.key === 'first_bet');
expect(firstBetMission.status).toMatch(/COMPLETED|CLAIMED/);
```

- [ ] **Step 2: Run e2e to verify it fails**

Run: `npm run test:e2e -- bets.e2e-spec.ts -t "places a bet"`

Expected: FAIL because bet response has no `progressionEvents`.

- [ ] **Step 3: Wire ProgressionModule into BetsModule**

Import `ProgressionModule` in `BetsModule`. Avoid circular imports by keeping `ProgressionModule` independent from `BetsModule`.

- [ ] **Step 4: Update BetsService transaction**

Inject `ProgressionService`. After `tx.bet.create`, call:

```ts
const progressionEvents = await this.progression.recordBet(tx, userId, {
  amount: bet.amount,
  payout: bet.payout,
  multiplier: Number(bet.multiplier),
  risk: bet.risk,
});
```

Include `progressionEvents` in the returned object.

- [ ] **Step 5: Update BetResponse DTO**

Add DTO classes:

```ts
export class ProgressionEventResponse {
  type!: 'MISSION_PROGRESS' | 'MISSION_COMPLETED' | 'LEVEL_UP';
  missionId?: string;
  key?: string;
  progress?: number;
  target?: number;
  levelBefore?: number;
  levelAfter?: number;
}
```

Add optional `progressionEvents?: ProgressionEventResponse[]` to `BetResponse`.

- [ ] **Step 6: Run focused e2e**

Run: `npm run test:e2e -- bets.e2e-spec.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/bets test/e2e/bets.e2e-spec.ts
git commit -m "feat(bets): emit progression events"
```

## Task 12: Full Verification And OpenAPI Polish

**Files:**
- Review: `src/profile/dto/profile.response.ts`
- Review: `src/profile/dto/avatar-upload.response.ts`
- Review: `src/progression/dto/progression.response.ts`
- Review: `src/progression/dto/claim-reward.response.ts`
- Review: `src/swagger-plugin-config.spec.ts`

- [ ] **Step 1: Run full typecheck**

Run: `npm run typecheck`

Expected: PASS.

- [ ] **Step 2: Run lint**

Run: `npm run lint`

Expected: PASS. Review any auto-fixes before committing.

- [ ] **Step 3: Run unit tests**

Run: `npm test`

Expected: PASS.

- [ ] **Step 4: Run e2e tests**

Ensure Postgres is running: `docker compose up -d`

Run: `npm run test:e2e`

Expected: PASS.

- [ ] **Step 5: Verify Swagger DTO suffix coverage**

Run: `npm test -- src/swagger-plugin-config.spec.ts`

Expected: PASS and DTO suffix list still includes `.dto.ts`, `.query.ts`, `.response.ts`.

- [ ] **Step 6: Commit final polish**

If any OpenAPI DTO or lint polish changed files:

```bash
git add src/profile src/progression src/bets src/swagger-plugin-config.spec.ts
git commit -m "docs(api): expose progression profile schemas"
```

If no files changed, do not create an empty commit.

## Final Delivery Checklist

- [ ] `npm run prisma:generate` completed after schema edits.
- [ ] `npm run typecheck` passes.
- [ ] `npm run lint` passes.
- [ ] `npm test` passes.
- [ ] `npm run test:e2e` passes with Postgres running.
- [ ] `GET /api/v1/profile/me` returns nickname, avatar URL, balance, and progression summary.
- [ ] `PATCH /api/v1/profile/me` validates and updates nickname.
- [ ] `POST /api/v1/profile/avatar` accepts JPEG/PNG/WebP up to 2 MB and stores WebP avatar.
- [ ] `GET /api/v1/progression/me` returns daily/starter missions.
- [ ] `POST /api/v1/progression/daily/claim` credits balance and XP once.
- [ ] `POST /api/v1/progression/missions/:id/claim` credits balance and XP once.
- [ ] `POST /api/v1/bets` updates mission progress and returns `progressionEvents`.
