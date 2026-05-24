import { PrismaService } from '../prisma/prisma.service';
import { ProfileService } from './profile.service';

describe('ProfileService', () => {
  it('describes level progress from stored xp', async () => {
    const prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'user-1',
          email: 'profile_unit@test.local',
          balance: 10_000_000_000n,
          profile: {
            nickname: 'profile_unit',
            avatarUrl: null,
          },
          progress: {
            xp: 150,
            dailyStreak: 2,
          },
        }),
      },
    } as unknown as PrismaService;
    const service = new ProfileService(prisma);

    const profile = await service.getMe('user-1');

    expect(profile.progression).toEqual({
      level: 2,
      xp: 150,
      xpForCurrentLevel: 100,
      xpForNextLevel: 400,
      xpIntoCurrentLevel: 50,
      dailyStreak: 2,
    });
  });
});
