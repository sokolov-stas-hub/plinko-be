# Progression and Player Profile - Design Spec

**Date:** 2026-05-24
**Status:** Pending written-spec review
**Scope:** Add player profile, avatar upload, XP/levels, daily bonus, daily missions, and starter missions for the Plinko demo backend.

---

## 1. Goals

Add a lightweight retention layer that the frontend can connect to immediately:

- A player profile with nickname and uploaded avatar.
- XP and level progression.
- A daily bonus with streak rewards.
- Three daily missions per player per day.
- Starter missions for new-player onboarding.
- Manual reward claims so the frontend can animate completed missions and claimed rewards.

The feature should feel like a natural extension of the current backend. It should reuse the existing auth model, BigInt-as-string money contract, Prisma transaction style, and wallet balance conventions.

## 2. Non-Goals

- Public profile pages for other users.
- Social graph, friends, chat, clans, tournaments, or leaderboards.
- Admin-managed mission templates.
- User-selected mission rerolls.
- Real-money rewards.
- Multiple avatar sizes or image galleries.
- Moderation tooling for nicknames or avatars beyond first-release validation.

## 3. Product Behavior

The frontend can show a profile surface with:

- Nickname and avatar.
- Balance.
- Level and XP progress to the next level.
- Current daily streak.
- Daily bonus claim state.
- Daily missions and starter missions.

The game screen can show a compact progression widget. After each successful bet, the frontend can display progression events such as mission progress, mission completion, daily mission reward availability, and level-ups.

The user explicitly claims daily bonuses and mission rewards. Claiming a reward updates both the game balance and XP/level state.

## 4. Backend Architecture

Add two modules:

```text
src/profile/
  profile.module.ts
  profile.controller.ts
  profile.service.ts
  avatar-storage.service.ts
  dto/
    profile.response.ts
    update-profile.dto.ts
    avatar-upload.response.ts

src/progression/
  progression.module.ts
  progression.controller.ts
  progression.service.ts
  mission-definitions.ts
  level-curve.ts
  dto/
    progression.response.ts
    claim-reward.response.ts
```

`ProfileModule` owns nickname and avatar state. `ProgressionModule` owns XP, levels, daily streaks, mission progress, and reward claims.

`BetsService` calls `ProgressionService.recordBet(...)` inside the same Prisma transaction after a bet is created. The first implementation should keep this pragmatic and local: update progress from the bet result without adding a full event bus. The service boundary should still make a future event-driven version easy.

`WalletService` gets a small transaction-aware credit helper so rewards do not update `User.balance` directly from progression code.

## 5. Data Model

Add these Prisma models and relations.

```prisma
model User {
  id            String   @id @default(uuid())
  email         String   @unique
  passwordHash  String
  balance       BigInt   @default(0)
  createdAt     DateTime @default(now())

  profile       UserProfile?
  progress      UserProgress?
  missionProgress UserMissionProgress[]
  rewardLedger  ProgressionRewardLedger[]
  bets          Bet[]
  seeds         Seed[]
  refreshTokens RefreshToken[]
}

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

`UserProfile` and `UserProgress` should be created during registration in the same transaction that creates the user and initial active seed. Existing users should get rows lazily on first profile or progression read.

Every `ProgressionRewardLedger` row must store a concrete `periodKey` so the unique index is a reliable idempotency guard in PostgreSQL. Use the daily UTC date for daily bonuses and daily mission rewards, `starter` for starter mission rewards, and an explicit period key for any future reward source.

## 6. Profile and Avatar Rules

Nickname:

- Required for every profile.
- Unique.
- 3 to 20 characters.
- Allowed characters: ASCII letters, digits, underscore.
- Stored exactly as submitted after trimming.
- Duplicate nickname returns `409 Conflict`.

Default nickname:

- Derived from email prefix.
- Normalized to the allowed character set.
- Suffixed with a short random token when needed for uniqueness.

Avatar upload:

- Route accepts `multipart/form-data` with one image field.
- Allowed input formats: JPEG, PNG, WebP.
- Maximum input size: 2 MB.
- Backend converts to 256x256 WebP using `sharp`.
- Object key format: `avatars/{userId}/{uuid}.webp`.
- Store `avatarKey`, `avatarUrl`, and `avatarUpdatedAt`.
- Storage errors return `502 Bad Gateway`.

Storage uses an S3-compatible client so AWS S3 and Cloudflare R2 are interchangeable through configuration.

Required environment variables:

```text
AVATAR_STORAGE_ENDPOINT=
AVATAR_STORAGE_REGION=auto
AVATAR_STORAGE_BUCKET=
AVATAR_STORAGE_ACCESS_KEY_ID=
AVATAR_STORAGE_SECRET_ACCESS_KEY=
AVATAR_PUBLIC_BASE_URL=
```

## 7. XP and Level Curve

Use integer XP. Level starts at 1.

Recommended first curve:

```ts
xpForLevel(level) = level === 1 ? 0 : 100 * (level - 1) * (level - 1)
```

Examples:

| Level | Total XP required |
|---:|---:|
| 1 | 0 |
| 2 | 100 |
| 3 | 400 |
| 4 | 900 |
| 5 | 1600 |

Responses include `xpForCurrentLevel`, `xpForNextLevel`, and `xpIntoCurrentLevel` so the frontend can render progress without duplicating the curve.

## 8. Daily Bonus

Daily bonus is claimable once per UTC day.

Rewards:

| Streak day | Credits | XP |
|---:|---:|---:|
| 1 | 500 | 25 |
| 2 | 750 | 35 |
| 3 | 1000 | 50 |
| 4+ | 1250 | 60 |

Credit values are stored and returned in minimal units. For example, 500 credits is `500_000_000`.

Streak behavior:

- If the previous claim was yesterday UTC, increment streak.
- If the previous claim was today UTC, reject with `409 Conflict`.
- If the previous claim was before yesterday UTC or missing, set streak to 1.
- Return `nextClaimAt` as the next UTC midnight.

## 9. Missions

Daily missions:

- Three active daily missions per user per UTC day.
- Deterministically selected from mission definitions using `userId + periodKey`.
- `periodKey` is `YYYY-MM-DD`.
- Mission progress rows are created lazily when `GET /progression/me` or `recordBet(...)` runs.

Starter missions:

- One-time missions.
- `periodKey` is `starter`.
- Created lazily and never reset.

First-release mission definitions:

| Key | Type | Target | Completion rule | Credits | XP |
|---|---|---:|---|---:|---:|
| `place_10_bets` | DAILY | 10 | Count any placed bet | 500 | 40 |
| `win_3_bets` | DAILY | 3 | Count bets where `payout > amount` | 750 | 60 |
| `hit_2x` | DAILY | 1 | Count bets where `multiplier >= 2` | 750 | 60 |
| `play_high_risk_5` | DAILY | 5 | Count bets where `risk = HIGH` | 600 | 50 |
| `wager_1000_credits` | DAILY | 1000 | Sum wagered displayed credits | 1500 | 100 |
| `first_bet` | STARTER | 1 | Count any placed bet | 500 | 50 |
| `first_win` | STARTER | 1 | Count bets where `payout > amount` | 750 | 75 |
| `try_all_risks` | STARTER | 3 | Track LOW, MEDIUM, HIGH at least once | 1000 | 100 |
| `hit_5x` | STARTER | 1 | Count bets where `multiplier >= 5` | 1500 | 150 |
| `play_25_bets` | STARTER | 25 | Count any placed bet | 2000 | 200 |

For `try_all_risks`, `metadata` stores the distinct risks tried, for example `{ "risks": ["LOW", "HIGH"] }`, and `progress` is the count of distinct risk levels in that list.

Mission statuses:

- `ACTIVE`: progress is below target.
- `COMPLETED`: target reached, reward not claimed.
- `CLAIMED`: reward was issued.

## 10. API Surface

All routes are under `/api/v1` and require JWT auth.

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/profile/me` | - | Player profile aggregate |
| PATCH | `/profile/me` | `{ nickname }` | Updated profile aggregate |
| POST | `/profile/avatar` | multipart image | Updated profile aggregate |
| GET | `/progression/me` | - | Progression aggregate |
| POST | `/progression/daily/claim` | - | Claim response |
| POST | `/progression/missions/:id/claim` | - | Claim response |

`GET /profile/me` returns:

```ts
{
  id: string;
  email: string;
  nickname: string;
  avatarUrl: string | null;
  balance: string;
  progression: {
    level: number;
    xp: number;
    xpForCurrentLevel: number;
    xpForNextLevel: number;
    xpIntoCurrentLevel: number;
    dailyStreak: number;
  };
}
```

`GET /progression/me` returns:

```ts
{
  level: number;
  xp: number;
  xpForCurrentLevel: number;
  xpForNextLevel: number;
  xpIntoCurrentLevel: number;
  daily: {
    streak: number;
    canClaim: boolean;
    nextClaimAt: string;
    reward: {
      credits: string;
      xp: number;
    };
  };
  missions: {
    daily: MissionResponse[];
    starter: MissionResponse[];
  };
}

type MissionResponse = {
  id: string;
  key: string;
  title: string;
  description: string;
  type: 'DAILY' | 'STARTER';
  periodKey: string;
  progress: number;
  target: number;
  status: 'ACTIVE' | 'COMPLETED' | 'CLAIMED';
  creditReward: string;
  xpReward: number;
  claimable: boolean;
  completedAt: string | null;
  claimedAt: string | null;
};
```

Claim routes return:

```ts
{
  reward: {
    source: 'DAILY_BONUS' | 'MISSION';
    sourceKey: string;
    credits: string;
    xp: number;
    balanceAfter: string;
    levelBefore: number;
    levelAfter: number;
  };
  progression: ProgressionResponse;
}
```

`POST /bets` adds an optional field:

```ts
progressionEvents?: Array<
  | { type: 'MISSION_PROGRESS'; missionId: string; progress: number; target: number }
  | { type: 'MISSION_COMPLETED'; missionId: string; key: string }
  | { type: 'LEVEL_UP'; levelBefore: number; levelAfter: number }
>;
```

The frontend should still refetch `GET /progression/me` after a bet or claim. Events are for immediate UI feedback, not the source of truth.

## 11. Transaction and Idempotency Rules

Reward claims run in a Prisma transaction:

1. Lock the user row.
2. Lock or upsert `UserProgress`.
3. For mission claims, lock `UserMissionProgress`.
4. Validate claimability.
5. Insert `ProgressionRewardLedger`.
6. Credit balance through `WalletService`.
7. Add XP and recalculate level.
8. Mark daily claim time or mission `CLAIMED`.
9. Return reward and updated progression state.

The reward ledger unique index prevents duplicate reward issuance. If a duplicate claim reaches the transaction, return `409 Conflict` and do not credit balance or XP again.

Mission progress updates after bets should never issue rewards automatically. They only move missions from `ACTIVE` to `COMPLETED`.

## 12. Error Handling

| Case | Backend behavior | Frontend behavior |
|---|---|---|
| Invalid nickname | `400` | Inline validation error |
| Duplicate nickname | `409` | Inline "Nickname already taken" |
| Invalid avatar type | `400` | Inline or toast error |
| Avatar too large | `400` | Inline or toast error |
| Avatar storage failure | `502` | Retry toast |
| Daily already claimed | `409` | Refresh progression state |
| Mission not completed | `400` | Refresh progression state |
| Mission already claimed | `409` | Refresh progression state |
| Mission not found | `404` | Refresh progression state |

All error responses continue to use the global exception filter shape.

## 13. Frontend Contract

Recommended frontend queries:

- `['profile', 'me']` for profile screen and header identity.
- `['progression', 'me']` for game screen progression widgets.

After successful operations:

- Profile nickname update invalidates `['profile', 'me']`.
- Avatar upload invalidates `['profile', 'me']`.
- Daily claim invalidates `['profile', 'me']`, `['progression', 'me']`, and `['me']`.
- Mission claim invalidates `['profile', 'me']`, `['progression', 'me']`, and `['me']`.
- Bet placement invalidates `['progression', 'me']`; if `progressionEvents` includes visible changes, show toast or animation before refetch settles.

The frontend should treat all credit fields as BigInt strings and must not recalculate balance from reward values.

## 14. Testing

Unit tests:

- Level curve calculations.
- Daily reward schedule and streak reset rules.
- Daily mission deterministic selection.
- Mission progress transitions.
- Mission claim validation.
- Avatar validation rules.
- Nickname normalization and validation.

E2E tests:

- Registration creates profile and progress rows.
- `GET /profile/me` returns nickname, avatar, balance, and progression summary.
- `PATCH /profile/me` updates nickname and rejects duplicates.
- Avatar upload accepts valid images and rejects invalid type/size with storage mocked.
- `GET /progression/me` creates and returns daily plus starter missions.
- Daily claim credits balance, adds XP, updates streak, and rejects a second claim.
- Bet placement updates mission progress.
- Mission claim credits balance and XP exactly once.

Manual verification:

- Run the backend locally.
- Register a fresh user.
- Upload an avatar.
- Place bets until a starter or daily mission completes.
- Claim the reward.
- Confirm profile, balance, level, XP, and progression state update consistently.

## 15. Future Extensions

This design keeps first-release mission definitions in code. Later releases can add:

- Admin-managed mission templates.
- Weekly missions.
- Achievements.
- Leaderboards.
- Public profile pages.
- Reward history endpoint.
- Moderation queue for uploaded avatars.
- Event-driven progression updates.
