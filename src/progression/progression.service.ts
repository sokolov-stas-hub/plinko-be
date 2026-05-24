import { ConflictException, Injectable } from '@nestjs/common';
import { MissionStatus, MissionType, Prisma, RewardSource, UserMissionProgress, UserProgress } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { describeLevel, levelForXp } from './level-curve';
import { MissionDefinition, selectDailyMissions, STARTER_MISSIONS } from './mission-definitions';
import { ClaimRewardAggregate, ProgressionAggregate, ProgressionMission } from './types';

const STARTER_PERIOD_KEY = 'starter';
const DAILY_BONUS_REWARD = {
  credits: 500_000_000n,
  xp: 25,
};

export function periodKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function nextUtcMidnight(date = new Date()): Date {
  return new Date(`${periodKey(new Date(date.getTime() + 24 * 60 * 60 * 1000))}T00:00:00.000Z`);
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
        const { balanceAfter } = await this.wallet.lockAndCredit(tx, userId, DAILY_BONUS_REWARD.credits);

        const progress = await tx.userProgress.upsert({
          where: { userId },
          create: { userId },
          update: {},
        });
        if (periodKey(progress.lastDailyClaimAt ?? new Date(0)) === today) {
          throw new ConflictException('Daily bonus already claimed');
        }

        const newXp = progress.xp + DAILY_BONUS_REWARD.xp;
        const newLevel = levelForXp(newXp);
        const updatedProgress = await tx.userProgress.update({
          where: { userId },
          data: {
            xp: newXp,
            level: newLevel,
            dailyStreak: this.nextDailyStreak(progress.lastDailyClaimAt, progress.dailyStreak, now),
            lastDailyClaimAt: now,
          },
        });

        await tx.progressionRewardLedger.create({
          data: {
            userId,
            source: RewardSource.DAILY_BONUS,
            sourceKey: today,
            periodKey: today,
            creditAmount: DAILY_BONUS_REWARD.credits,
            xpAmount: DAILY_BONUS_REWARD.xp,
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
            credits: DAILY_BONUS_REWARD.credits,
            xp: DAILY_BONUS_REWARD.xp,
            balanceAfter,
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

  private serializeMissions(
    definitions: readonly MissionDefinition[],
    rows: UserMissionProgress[],
    missionPeriodKey: string,
  ): ProgressionMission[] {
    return definitions.map(definition => {
      const row = rows.find(item => item.missionKey === definition.key && item.periodKey === missionPeriodKey);
      return {
        key: definition.key,
        type: definition.type,
        title: definition.title,
        description: definition.description,
        target: row?.target ?? definition.target,
        progress: row?.progress ?? 0,
        status: row?.status ?? MissionStatus.ACTIVE,
        reward: {
          credits: row?.creditReward ?? definition.creditReward,
          xp: row?.xpReward ?? definition.xpReward,
        },
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
        reward: DAILY_BONUS_REWARD,
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

  private isRewardLedgerUniqueConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code !== 'P2002') return false;
    const target = error.meta?.target;
    if (Array.isArray(target)) return target.includes('userId') && target.includes('source');
    return typeof target === 'string' && target.includes('ProgressionRewardLedger');
  }
}
