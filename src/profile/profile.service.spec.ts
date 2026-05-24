import { PrismaService } from '../prisma/prisma.service';
import { AvatarStorageService } from './avatar-storage.service';
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
    const avatarStorage = {} as unknown as AvatarStorageService;
    const service = new ProfileService(prisma, avatarStorage);

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

  it('creates a missing profile before uploading an avatar', async () => {
    const user = {
      id: 'legacy-user',
      email: 'legacy.user@test.local',
      balance: 10_000_000_000n,
      profile: {
        nickname: 'legacy_user_abc',
        avatarUrl: 'https://cdn.example.com/avatars/legacy-user/avatar.webp',
      },
      progress: {
        xp: 0,
        dailyStreak: 0,
      },
    };
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce({
            id: user.id,
            email: user.email,
            profile: null,
          })
          .mockResolvedValue(user),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ userId: user.id, nickname: 'legacy_user_abc' }),
        update: jest.fn().mockResolvedValue({}),
      },
    } as unknown as PrismaService;
    const avatarStorage = {
      uploadAvatar: jest.fn().mockResolvedValue({
        avatarKey: 'avatars/legacy-user/avatar.webp',
        avatarUrl: 'https://cdn.example.com/avatars/legacy-user/avatar.webp',
      }),
    } as unknown as AvatarStorageService;
    const service = new ProfileService(prisma, avatarStorage);

    const profile = await service.uploadAvatar(user.id, Buffer.from('image'));

    expect(prisma.userProfile.create).toHaveBeenCalledWith({
      data: { userId: user.id, nickname: expect.stringMatching(/^legacy_user_[0-9a-f]{6}$/) },
    });
    expect((avatarStorage.uploadAvatar as jest.Mock).mock.invocationCallOrder[0]).toBeGreaterThan(
      (prisma.userProfile.create as jest.Mock).mock.invocationCallOrder[0],
    );
    expect(prisma.userProfile.update).toHaveBeenCalledWith({
      where: { userId: user.id },
      data: {
        avatarKey: 'avatars/legacy-user/avatar.webp',
        avatarUrl: 'https://cdn.example.com/avatars/legacy-user/avatar.webp',
        avatarUpdatedAt: expect.any(Date),
      },
    });
    expect(profile.avatarUrl).toBe('https://cdn.example.com/avatars/legacy-user/avatar.webp');
  });

  it('creates a missing profile on read and returns the persisted nickname', async () => {
    const userWithoutProfile = {
      id: 'legacy-read-user',
      email: 'legacy.read@test.local',
      balance: 10_000_000_000n,
      profile: null,
      progress: {
        xp: 0,
        dailyStreak: 0,
      },
    };
    const userWithProfile = {
      ...userWithoutProfile,
      profile: {
        nickname: 'legacy_read_abc',
        avatarUrl: null,
      },
    };
    const prisma = {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValueOnce(userWithoutProfile)
          .mockResolvedValueOnce(userWithoutProfile)
          .mockResolvedValueOnce(userWithProfile),
      },
      userProfile: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({ userId: userWithoutProfile.id, nickname: 'legacy_read_abc' }),
      },
    } as unknown as PrismaService;
    const service = new ProfileService(prisma, {} as unknown as AvatarStorageService);

    const profile = await service.getMe(userWithoutProfile.id);

    expect(prisma.userProfile.create).toHaveBeenCalledWith({
      data: { userId: userWithoutProfile.id, nickname: expect.stringMatching(/^legacy_read_[0-9a-f]{6}$/) },
    });
    expect(profile.nickname).toBe('legacy_read_abc');
  });
});
