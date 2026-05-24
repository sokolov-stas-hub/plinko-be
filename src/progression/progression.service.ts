import { Injectable } from '@nestjs/common';
import { MissionStatus, MissionType, Prisma, UserMissionProgress } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { describeLevel } from './level-curve';
import { MissionDefinition, selectDailyMissions, STARTER_MISSIONS } from './mission-definitions';
import { ProgressionAggregate, ProgressionMission } from './types';

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
  constructor(private readonly prisma: PrismaService) {}

  async getMe(userId: string): Promise<ProgressionAggregate> {
    const now = new Date();
    const today = periodKey(now);
    const dailyDefinitions = selectDailyMissions(userId, today);

    const progress = await this.prisma.userProgress.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });

    await this.ensureMissions(userId, today, dailyDefinitions, STARTER_PERIOD_KEY, STARTER_MISSIONS);

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

  private async ensureMissions(
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

    await this.prisma.userMissionProgress.createMany({
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
}
