import { ConflictException } from '@nestjs/common';
import { MissionStatus, MissionType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { STARTER_MISSIONS } from './mission-definitions';
import { applyBetToMission, nextUtcMidnight, periodKey, ProgressionService } from './progression.service';

type PrismaMock = {
  $transaction?: jest.Mock;
  userProgress: {
    upsert: jest.Mock;
  };
  userMissionProgress: {
    createMany: jest.Mock;
    findMany: jest.Mock;
  };
};

function uniqueConflict(target: string[]): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: { target },
  });
}

type MissionForOptions = Partial<{
  progress: number;
  metadata: Prisma.JsonValue;
  status: MissionStatus;
}>;

function missionFor(missionKey: string, options: MissionForOptions = {}) {
  return {
    id: `${missionKey}-id`,
    userId: 'user-1',
    missionKey,
    periodKey: missionKey.startsWith('place_') || missionKey.startsWith('win_') ? '2026-05-24' : 'starter',
    type: missionKey.startsWith('place_') || missionKey.startsWith('win_') ? MissionType.DAILY : MissionType.STARTER,
    target: missionKey === 'try_all_risks' ? 3 : missionKey === 'wager_1000_credits' ? 1000 : 10,
    progress: options.progress ?? 0,
    metadata: options.metadata ?? null,
    status: options.status ?? MissionStatus.ACTIVE,
    creditReward: 500_000_000n,
    xpReward: 50,
    completedAt: null,
    claimedAt: null,
    createdAt: new Date('2026-05-24T00:00:00.000Z'),
    updatedAt: new Date('2026-05-24T00:00:00.000Z'),
  };
}

describe('ProgressionService', () => {
  it('completes count bet missions when progress reaches target', () => {
    expect(
      applyBetToMission(missionFor('place_10_bets', { progress: 9 }), {
        amount: 1_000_000n,
        payout: 0n,
        multiplier: 0,
        risk: 'LOW',
      }),
    ).toMatchObject({ progress: 10, status: 'COMPLETED' });
  });

  it('tracks unique risks in mission metadata', () => {
    expect(
      applyBetToMission(missionFor('try_all_risks', { progress: 1, metadata: { risks: ['LOW'] } }), {
        amount: 1_000_000n,
        payout: 0n,
        multiplier: 0,
        risk: 'HIGH',
      }),
    ).toMatchObject({ progress: 2, metadata: { risks: ['LOW', 'HIGH'] } });
  });

  it('adds whole wagered credits and caps mission progress', () => {
    expect(
      applyBetToMission(missionFor('wager_1000_credits', { progress: 998 }), {
        amount: 3_500_000n,
        payout: 0n,
        multiplier: 0,
        risk: 'MEDIUM',
      }),
    ).toMatchObject({ progress: 1000, status: 'COMPLETED' });
  });

  it('leaves completed missions unchanged', () => {
    expect(
      applyBetToMission(missionFor('first_win', { progress: 1, status: MissionStatus.COMPLETED }), {
        amount: 1_000_000n,
        payout: 2_000_000n,
        multiplier: 2,
        risk: 'LOW',
      }),
    ).toMatchObject({ progress: 1, status: 'COMPLETED' });
  });

  it('uses UTC date boundaries for progression periods', () => {
    const date = new Date('2026-05-24T23:30:00.000Z');

    expect(periodKey(date)).toBe('2026-05-24');
    expect(nextUtcMidnight(date).toISOString()).toBe('2026-05-25T00:00:00.000Z');
  });

  it('upserts progress, creates daily and starter missions, and returns the aggregate', async () => {
    const prisma: PrismaMock = {
      userProgress: {
        upsert: jest.fn().mockResolvedValue({
          userId: 'user-1',
          xp: 0,
          level: 1,
          dailyStreak: 0,
          lastDailyClaimAt: null,
        }),
      },
      userMissionProgress: {
        createMany: jest.fn().mockResolvedValue({ count: 8 }),
        findMany: jest.fn().mockResolvedValue([
          {
            userId: 'user-1',
            missionKey: 'first_bet',
            periodKey: 'starter',
            type: MissionType.STARTER,
            target: 1,
            progress: 0,
            status: MissionStatus.ACTIVE,
            creditReward: 500_000_000n,
            xpReward: 50,
            completedAt: null,
            claimedAt: null,
          },
        ]),
      },
    };
    const wallet = { lockAndCredit: jest.fn() };
    const service = new ProgressionService(
      prisma as unknown as PrismaService,
      wallet as unknown as WalletService,
    );

    const aggregate = await service.getMe('user-1');

    expect(prisma.userProgress.upsert).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      create: { userId: 'user-1' },
      update: {},
    });
    expect(prisma.userMissionProgress.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({
          missionKey: 'first_bet',
          periodKey: 'starter',
          type: MissionType.STARTER,
          target: 1,
          progress: 0,
          status: MissionStatus.ACTIVE,
          creditReward: 500_000_000n,
          xpReward: 50,
        }),
      ]),
      skipDuplicates: true,
    });
    expect(prisma.userMissionProgress.createMany.mock.calls[0][0].data).toHaveLength(3 + STARTER_MISSIONS.length);
    expect(aggregate.level).toBe(1);
    expect(aggregate.xp).toBe(0);
    expect(aggregate.daily.canClaim).toBe(true);
    expect(aggregate.daily.reward.credits).toBe(500_000_000n);
    expect(aggregate.missions.daily).toHaveLength(3);
    expect(aggregate.missions.starter.map(mission => mission.key)).toContain('first_bet');
  });

  it('maps only the daily reward ledger unique key to claim conflict', async () => {
    const wallet = { lockAndCredit: jest.fn() };
    const unrelatedUnique = uniqueConflict(['userId', 'source']);
    const unrelatedPrisma: PrismaMock = {
      $transaction: jest.fn().mockRejectedValue(unrelatedUnique),
      userProgress: { upsert: jest.fn() },
      userMissionProgress: { createMany: jest.fn(), findMany: jest.fn() },
    };
    const unrelatedService = new ProgressionService(
      unrelatedPrisma as unknown as PrismaService,
      wallet as unknown as WalletService,
    );

    await expect(unrelatedService.claimDaily('user-1')).rejects.toBe(unrelatedUnique);

    const ledgerPrisma: PrismaMock = {
      $transaction: jest
        .fn()
        .mockRejectedValue(uniqueConflict(['userId', 'source', 'sourceKey', 'periodKey'])),
      userProgress: { upsert: jest.fn() },
      userMissionProgress: { createMany: jest.fn(), findMany: jest.fn() },
    };
    const ledgerService = new ProgressionService(
      ledgerPrisma as unknown as PrismaService,
      wallet as unknown as WalletService,
    );

    await expect(ledgerService.claimDaily('user-1')).rejects.toBeInstanceOf(ConflictException);
  });
});
