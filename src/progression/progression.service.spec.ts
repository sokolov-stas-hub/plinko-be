import { MissionStatus, MissionType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { WalletService } from '../wallet/wallet.service';
import { STARTER_MISSIONS } from './mission-definitions';
import { nextUtcMidnight, periodKey, ProgressionService } from './progression.service';

type PrismaMock = {
  userProgress: {
    upsert: jest.Mock;
  };
  userMissionProgress: {
    createMany: jest.Mock;
    findMany: jest.Mock;
  };
};

describe('ProgressionService', () => {
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
});
