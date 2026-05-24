import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MissionStatus, MissionType, Prisma, RewardSource, UserMissionProgress, UserProgress } from '@prisma/client';
import { Risk } from '../game/types';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { describeLevel, levelForXp } from './level-curve';
import { DAILY_MISSIONS, MissionDefinition, selectDailyMissions, STARTER_MISSIONS } from './mission-definitions';
import { ClaimRewardAggregate, ProgressionAggregate, ProgressionEvent, ProgressionMission, ProgressionReward } from './types';

const STARTER_PERIOD_KEY = 'starter';
const DAILY_BONUS_REWARD = {
  credits: 500_000_000n,
  xp: 25,
};
const DAILY_BONUS_REWARDS = [
  DAILY_BONUS_REWARD,
  { credits: 750_000_000n, xp: 35 },
  { credits: 1_000_000_000n, xp: 50 },
  { credits: 1_250_000_000n, xp: 60 },
] as const;
const CREDIT_UNIT = 1_000_000n;

export type BetProgressInput = {
  amount: bigint;
  payout: bigint;
  multiplier: number;
  risk: Risk;
};

type MissionMetadata = {
  risks?: Risk[];
  wageredAmount?: string;
};

type AppliedMission = UserMissionProgress & {
  metadata: Prisma.JsonValue | null;
};

export function periodKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function nextUtcMidnight(date = new Date()): Date {
  return new Date(`${periodKey(new Date(date.getTime() + 24 * 60 * 60 * 1000))}T00:00:00.000Z`);
}

export function applyBetToMission(mission: AppliedMission, bet: BetProgressInput): AppliedMission {
  if (mission.status !== MissionStatus.ACTIVE) return cloneMission(mission);

  const definition = findMissionDefinition(mission.missionKey);
  if (!definition) return cloneMission(mission);

  const next = cloneMission(mission);
  const metadata = readMissionMetadata(mission.metadata);

  switch (definition.rule.kind) {
    case 'count_bets':
      next.progress += 1;
      break;
    case 'count_wins':
      if (bet.payout > bet.amount) next.progress += 1;
      break;
    case 'hit_multiplier':
      if (bet.multiplier >= definition.rule.multiplier) next.progress = mission.target;
      break;
    case 'count_risk':
      if (bet.risk === definition.rule.risk) next.progress += 1;
      break;
    case 'wager_credits': {
      const wageredAmount = parseWageredAmount(metadata.wageredAmount, mission.progress) + bet.amount;
      next.metadata = { ...metadata, wageredAmount: wageredAmount.toString() };
      next.progress = Number(wageredAmount / CREDIT_UNIT);
      break;
    }
    case 'try_all_risks': {
      const risks = uniqueRisks(metadata.risks ?? []);
      if (!risks.includes(bet.risk)) risks.push(bet.risk);
      next.metadata = { ...metadata, risks };
      next.progress = risks.length;
      break;
    }
  }

  next.progress = Math.min(next.progress, mission.target);
  if (next.progress >= mission.target) {
    next.status = MissionStatus.COMPLETED;
  }
  return next;
}

function findMissionDefinition(missionKey: string): MissionDefinition | undefined {
  return [...DAILY_MISSIONS, ...STARTER_MISSIONS].find(definition => definition.key === missionKey);
}

function cloneMission(mission: AppliedMission): AppliedMission {
  return {
    ...mission,
    metadata: cloneJson(mission.metadata),
  };
}

function cloneJson(value: Prisma.JsonValue | null): Prisma.JsonValue | null {
  if (value === null) return null;
  return JSON.parse(JSON.stringify(value)) as Prisma.JsonValue;
}

function readMissionMetadata(value: Prisma.JsonValue | null): MissionMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const metadata = value as { risks?: unknown; wageredAmount?: unknown };
  const result: MissionMetadata = {};
  if (typeof metadata.wageredAmount === 'string') {
    result.wageredAmount = metadata.wageredAmount;
  }
  if (Array.isArray(metadata.risks)) {
    result.risks = uniqueRisks(metadata.risks);
  }
  return result;
}

function uniqueRisks(values: unknown[]): Risk[] {
  const risks: Risk[] = [];
  for (const value of values) {
    if ((value === 'LOW' || value === 'MEDIUM' || value === 'HIGH') && !risks.includes(value)) {
      risks.push(value);
    }
  }
  return risks;
}

function parseWageredAmount(value: string | undefined, progressFallback: number): bigint {
  const fallback = BigInt(Math.max(0, progressFallback)) * CREDIT_UNIT;
  if (!value) return fallback;
  try {
    const amount = BigInt(value);
    return amount > 0n ? amount : fallback;
  } catch {
    return fallback;
  }
}

@Injectable()
export class ProgressionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: WalletService,
  ) {}

  async getMe(userId: string): Promise<ProgressionAggregate> {
    const now = new Date();
    const today = periodKey(now);
    const dailyDefinitions = selectDailyMissions(userId, today);

    const progress = await this.prisma.userProgress.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    await this.ensureMissions(this.prisma, userId, today, dailyDefinitions, STARTER_PERIOD_KEY, STARTER_MISSIONS);

    const missionRows = await this.prisma.userMissionProgress.findMany({
      where: {
        userId,
        OR: [
          { periodKey: today, type: MissionType.DAILY },
          { periodKey: STARTER_PERIOD_KEY, type: MissionType.STARTER },
        ],
      },
    });

    const level = describeLevel(progress.xp);

    return {
      ...level,
      ...this.serializeDailyAndMissions(now, today, progress, dailyDefinitions, missionRows),
    };
  }

  async claimDaily(userId: string): Promise<ClaimRewardAggregate> {
    const now = new Date();
    const today = periodKey(now);
    const dailyDefinitions = selectDailyMissions(userId, today);

    try {
      return await this.prisma.$transaction(async tx => {
        const progress = await this.lockUserProgress(tx, userId);
        if (periodKey(progress.lastDailyClaimAt ?? new Date(0)) === today) {
          throw new ConflictException('Daily bonus already claimed');
        }

        const claimStreak = this.nextDailyStreak(progress.lastDailyClaimAt, progress.dailyStreak, now);
        const reward = this.dailyRewardForStreak(claimStreak);
        const { balanceAfter } = await this.wallet.lockAndCredit(tx, userId, reward.credits);

        const newXp = progress.xp + reward.xp;
        const newLevel = levelForXp(newXp);
        const updatedProgress = await tx.userProgress.update({
          where: { userId },
          data: {
            xp: newXp,
            level: newLevel,
            dailyStreak: claimStreak,
            lastDailyClaimAt: now,
          },
        });

        await tx.progressionRewardLedger.create({
          data: {
            userId,
            source: RewardSource.DAILY_BONUS,
            sourceKey: today,
            periodKey: today,
            creditAmount: reward.credits,
            xpAmount: reward.xp,
            balanceAfter,
            levelBefore: progress.level,
            levelAfter: newLevel,
          },
        });

        await this.ensureMissions(tx, userId, today, dailyDefinitions, STARTER_PERIOD_KEY, STARTER_MISSIONS);
        const missionRows = await tx.userMissionProgress.findMany({
          where: {
            userId,
            OR: [
              { periodKey: today, type: MissionType.DAILY },
              { periodKey: STARTER_PERIOD_KEY, type: MissionType.STARTER },
            ],
          },
        });

        return {
          reward: {
            source: RewardSource.DAILY_BONUS,
            sourceKey: today,
            periodKey: today,
            credits: reward.credits,
            xp: reward.xp,
            balanceAfter,
            levelBefore: progress.level,
            levelAfter: newLevel,
          },
          progression: {
            ...describeLevel(updatedProgress.xp),
            ...this.serializeDailyAndMissions(now, today, updatedProgress, dailyDefinitions, missionRows),
          },
        };
      });
    } catch (error) {
      if (this.isRewardLedgerUniqueConflict(error)) {
        throw new ConflictException('Daily bonus already claimed');
      }
      throw error;
    }
  }

  async recordBet(tx: Prisma.TransactionClient, userId: string, bet: BetProgressInput): Promise<ProgressionEvent[]> {
    const now = new Date();
    const today = periodKey(now);
    const dailyDefinitions = selectDailyMissions(userId, today);
    await this.ensureMissions(tx, userId, today, dailyDefinitions, STARTER_PERIOD_KEY, STARTER_MISSIONS);

    const missions = await tx.userMissionProgress.findMany({
      where: {
        userId,
        status: MissionStatus.ACTIVE,
        OR: [
          { periodKey: today, type: MissionType.DAILY },
          { periodKey: STARTER_PERIOD_KEY, type: MissionType.STARTER },
        ],
      },
    });

    const events: ProgressionEvent[] = [];
    for (const mission of missions) {
      const next = applyBetToMission(mission, bet);
      if (next.progress === mission.progress && next.status === mission.status && jsonEquals(next.metadata, mission.metadata)) {
        continue;
      }

      const completedAt =
        mission.status !== MissionStatus.COMPLETED && next.status === MissionStatus.COMPLETED ? now : mission.completedAt;
      await tx.userMissionProgress.update({
        where: { id: mission.id },
        data: {
          progress: next.progress,
          metadata: next.metadata ?? Prisma.JsonNull,
          status: next.status,
          completedAt,
        },
      });

      events.push({
        type: next.status === MissionStatus.COMPLETED ? 'MISSION_COMPLETED' : 'MISSION_PROGRESS',
        missionId: mission.id,
        missionKey: mission.missionKey,
        progress: next.progress,
        target: next.target,
      });
    }

    return events;
  }

  async claimMission(userId: string, missionId: string): Promise<ClaimRewardAggregate> {
    const now = new Date();

    try {
      return await this.prisma.$transaction(async tx => {
        const mission = await tx.userMissionProgress.findFirst({
          where: { id: missionId, userId },
        });
        if (!mission) {
          throw new NotFoundException('Mission not found');
        }
        if (mission.status === MissionStatus.ACTIVE) {
          throw new ConflictException('Mission is not complete');
        }
        if (mission.status === MissionStatus.CLAIMED) {
          throw new ConflictException('Mission reward already claimed');
        }

        const progress = await this.lockUserProgress(tx, userId);
        const lockedMission = await tx.userMissionProgress.findFirst({
          where: { id: missionId, userId },
        });
        if (!lockedMission) {
          throw new NotFoundException('Mission not found');
        }
        if (lockedMission.status === MissionStatus.ACTIVE) {
          throw new ConflictException('Mission is not complete');
        }
        if (lockedMission.status === MissionStatus.CLAIMED) {
          throw new ConflictException('Mission reward already claimed');
        }

        const newXp = progress.xp + lockedMission.xpReward;
        const newLevel = levelForXp(newXp);
        const { balanceAfter } = await this.wallet.lockAndCredit(tx, userId, lockedMission.creditReward);

        await tx.progressionRewardLedger.create({
          data: {
            userId,
            source: RewardSource.MISSION,
            sourceKey: lockedMission.missionKey,
            periodKey: lockedMission.periodKey,
            creditAmount: lockedMission.creditReward,
            xpAmount: lockedMission.xpReward,
            balanceAfter,
            levelBefore: progress.level,
            levelAfter: newLevel,
          },
        });

        const updatedProgress = await tx.userProgress.update({
          where: { userId },
          data: {
            xp: newXp,
            level: newLevel,
          },
        });

        await tx.userMissionProgress.update({
          where: { id: lockedMission.id },
          data: {
            status: MissionStatus.CLAIMED,
            claimedAt: now,
          },
        });

        const today = periodKey(now);
        const dailyDefinitions = selectDailyMissions(userId, today);
        await this.ensureMissions(tx, userId, today, dailyDefinitions, STARTER_PERIOD_KEY, STARTER_MISSIONS);
        const missionRows = await tx.userMissionProgress.findMany({
          where: {
            userId,
            OR: [
              { periodKey: today, type: MissionType.DAILY },
              { periodKey: STARTER_PERIOD_KEY, type: MissionType.STARTER },
            ],
          },
        });

        return {
          reward: {
            source: RewardSource.MISSION,
            sourceKey: lockedMission.missionKey,
            periodKey: lockedMission.periodKey,
            missionId: lockedMission.id,
            missionKey: lockedMission.missionKey,
            credits: lockedMission.creditReward,
            xp: lockedMission.xpReward,
            balanceAfter,
            levelBefore: progress.level,
            levelAfter: newLevel,
          },
          progression: {
            ...describeLevel(updatedProgress.xp),
            ...this.serializeDailyAndMissions(now, today, updatedProgress, dailyDefinitions, missionRows),
          },
        };
      });
    } catch (error) {
      if (this.isRewardLedgerUniqueConflict(error)) {
        throw new ConflictException('Mission reward already claimed');
      }
      throw error;
    }
  }

  private async ensureMissions(
    db: Pick<Prisma.TransactionClient, 'userMissionProgress'>,
    userId: string,
    dailyPeriodKey: string,
    dailyDefinitions: readonly MissionDefinition[],
    starterPeriodKey: string,
    starterDefinitions: readonly MissionDefinition[],
  ): Promise<void> {
    const data = [
      ...dailyDefinitions.map(definition => this.createMissionRow(userId, dailyPeriodKey, definition)),
      ...starterDefinitions.map(definition => this.createMissionRow(userId, starterPeriodKey, definition)),
    ];

    await db.userMissionProgress.createMany({
      data,
      skipDuplicates: true,
    });
  }

  private createMissionRow(
    userId: string,
    missionPeriodKey: string,
    definition: MissionDefinition,
  ): Prisma.UserMissionProgressCreateManyInput {
    return {
      userId,
      missionKey: definition.key,
      periodKey: missionPeriodKey,
      type: definition.type,
      target: definition.target,
      progress: 0,
      status: MissionStatus.ACTIVE,
      creditReward: definition.creditReward,
      xpReward: definition.xpReward,
    };
  }

  private async lockUserProgress(tx: Prisma.TransactionClient, userId: string): Promise<UserProgress> {
    await tx.userProgress.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    const rows = await tx.$queryRaw<UserProgress[]>`
      SELECT * FROM "UserProgress" WHERE "userId" = ${userId} FOR UPDATE
    `;
    if (rows.length === 0) {
      throw new NotFoundException('User progress not found');
    }
    return rows[0];
  }

  private serializeMissions(
    definitions: readonly MissionDefinition[],
    rows: UserMissionProgress[],
    missionPeriodKey: string,
  ): ProgressionMission[] {
    return definitions.map(definition => {
      const row = rows.find(item => item.missionKey === definition.key && item.periodKey === missionPeriodKey);
      return {
        id: row?.id ?? null,
        key: definition.key,
        type: definition.type,
        title: definition.title,
        description: definition.description,
        periodKey: row?.periodKey ?? missionPeriodKey,
        target: row?.target ?? definition.target,
        progress: row?.progress ?? 0,
        status: row?.status ?? MissionStatus.ACTIVE,
        creditReward: row?.creditReward ?? definition.creditReward,
        xpReward: row?.xpReward ?? definition.xpReward,
        claimable: row?.status === MissionStatus.COMPLETED,
        completedAt: row?.completedAt?.toISOString() ?? null,
        claimedAt: row?.claimedAt?.toISOString() ?? null,
      };
    });
  }

  private serializeDailyAndMissions(
    now: Date,
    today: string,
    progress: Pick<UserProgress, 'lastDailyClaimAt' | 'dailyStreak'>,
    dailyDefinitions: readonly MissionDefinition[],
    missionRows: UserMissionProgress[],
  ): Pick<ProgressionAggregate, 'daily' | 'missions'> {
    return {
      daily: {
        canClaim: periodKey(progress.lastDailyClaimAt ?? new Date(0)) !== today,
        streak: progress.dailyStreak,
        nextClaimAt: nextUtcMidnight(now).toISOString(),
        reward: this.dailyRewardForStreak(this.nextDailyClaimStreak(progress.lastDailyClaimAt, progress.dailyStreak, now)),
      },
      missions: {
        daily: this.serializeMissions(dailyDefinitions, missionRows, today),
        starter: this.serializeMissions(STARTER_MISSIONS, missionRows, STARTER_PERIOD_KEY),
      },
    };
  }

  private nextDailyStreak(lastDailyClaimAt: Date | null, currentStreak: number, now: Date): number {
    if (lastDailyClaimAt && periodKey(lastDailyClaimAt) === periodKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))) {
      return currentStreak + 1;
    }
    return 1;
  }

  private nextDailyClaimStreak(lastDailyClaimAt: Date | null, currentStreak: number, now: Date): number {
    if (!lastDailyClaimAt) return 1;
    if (periodKey(lastDailyClaimAt) === periodKey(now)) {
      return currentStreak + 1;
    }
    return this.nextDailyStreak(lastDailyClaimAt, currentStreak, now);
  }

  private dailyRewardForStreak(streak: number): ProgressionReward {
    return DAILY_BONUS_REWARDS[Math.min(Math.max(streak, 1), DAILY_BONUS_REWARDS.length) - 1];
  }

  private isRewardLedgerUniqueConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code !== 'P2002') return false;
    const target = error.meta?.target;
    if (Array.isArray(target)) {
      return ['userId', 'source', 'sourceKey', 'periodKey'].every(field => target.includes(field));
    }
    return typeof target === 'string' && target.includes('ProgressionRewardLedger');
  }
}

function jsonEquals(left: Prisma.JsonValue | null, right: Prisma.JsonValue | null): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}
