import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { SeedsService } from '../seeds/seeds.service';

jest.mock('crypto', () => ({
  randomBytes: jest.fn(),
}));

describe('UsersService', () => {
  const mockedRandomBytes = randomBytes as unknown as jest.Mock<Buffer, [number]>;
  const user = {
    id: 'user-1',
    email: 'demo@test.local',
    passwordHash: 'hash',
    balance: 10_000_000_000n,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  };

  beforeEach(() => {
    mockedRandomBytes.mockReset();
    mockedRandomBytes.mockReturnValue(Buffer.from('a1b2c3', 'hex'));
  });

  function p2002NicknameError(): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError('Unique constraint failed on the fields: (`nickname`)', {
      code: 'P2002',
      clientVersion: '5.10.0',
      meta: { target: ['nickname'] },
    });
  }

  type MockTx = {
    user: {
      create: jest.Mock;
    };
    userProfile: {
      create: jest.Mock;
      findUnique: jest.Mock;
    };
    userProgress: {
      create: jest.Mock;
    };
  };

  function createTx(overrides: { user?: Partial<MockTx['user']>; userProfile?: Partial<MockTx['userProfile']>; userProgress?: Partial<MockTx['userProgress']> } = {}): MockTx {
    return {
      user: {
        create: overrides.user?.create ?? jest.fn().mockResolvedValue(user),
      },
      userProfile: {
        create: overrides.userProfile?.create ?? jest.fn().mockResolvedValue(undefined),
        findUnique: overrides.userProfile?.findUnique ?? jest.fn().mockResolvedValue(null),
      },
      userProgress: {
        create: overrides.userProgress?.create ?? jest.fn().mockResolvedValue(undefined),
      },
    };
  }

  it('creates new users with enough balance for demo bets', async () => {
    const tx = createTx();
    const prisma = {
      $transaction: jest.fn((callback: (txArg: typeof tx) => Promise<unknown>) => callback(tx)),
    } as unknown as PrismaService;
    const seeds = {
      createForUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as SeedsService;
    const service = new UsersService(prisma, seeds);

    await service.createWithSeed(user.email, user.passwordHash);

    expect(tx.user.create).toHaveBeenCalledWith({
      data: {
        email: user.email,
        passwordHash: user.passwordHash,
        balance: 10_000_000_000n,
      },
    });
    expect(seeds.createForUser).toHaveBeenCalledWith(tx, user.id);
    expect(tx.userProfile.create).toHaveBeenCalledWith({
      data: {
        userId: user.id,
        nickname: 'demo_a1b2c3',
      },
    });
    expect(tx.userProgress.create).toHaveBeenCalledWith({
      data: { userId: user.id },
    });
  });

  it('retries the registration transaction when a nickname candidate already exists', async () => {
    mockedRandomBytes.mockReturnValueOnce(Buffer.from('111111', 'hex')).mockReturnValueOnce(Buffer.from('222222', 'hex'));
    const firstTx = createTx({
      userProfile: {
        create: jest.fn().mockResolvedValue(undefined),
        findUnique: jest.fn().mockResolvedValue({ userId: 'other-user', nickname: 'demo_111111' }),
      },
    });
    const secondTx = createTx();
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementationOnce((callback: (txArg: typeof firstTx) => Promise<unknown>) => callback(firstTx))
        .mockImplementationOnce((callback: (txArg: typeof secondTx) => Promise<unknown>) => callback(secondTx)),
    } as unknown as PrismaService;
    const seeds = {
      createForUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as SeedsService;
    const service = new UsersService(prisma, seeds);

    await service.createWithSeed(user.email, user.passwordHash);

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(firstTx.userProfile.create).not.toHaveBeenCalled();
    expect(secondTx.userProfile.create).toHaveBeenCalledWith({
      data: { userId: user.id, nickname: 'demo_222222' },
    });
    expect(secondTx.userProgress.create).toHaveBeenCalledWith({
      data: { userId: user.id },
    });
  });

  it('retries the registration transaction when profile creation hits a nickname unique constraint', async () => {
    mockedRandomBytes.mockReturnValueOnce(Buffer.from('333333', 'hex')).mockReturnValueOnce(Buffer.from('444444', 'hex'));
    const firstTx = createTx({
      userProfile: {
        create: jest.fn().mockRejectedValue(p2002NicknameError()),
        findUnique: jest.fn().mockResolvedValue(null),
      },
    });
    const secondTx = createTx();
    const prisma = {
      $transaction: jest
        .fn()
        .mockImplementationOnce((callback: (txArg: typeof firstTx) => Promise<unknown>) => callback(firstTx))
        .mockImplementationOnce((callback: (txArg: typeof secondTx) => Promise<unknown>) => callback(secondTx)),
    } as unknown as PrismaService;
    const seeds = {
      createForUser: jest.fn().mockResolvedValue(undefined),
    } as unknown as SeedsService;
    const service = new UsersService(prisma, seeds);

    await service.createWithSeed(user.email, user.passwordHash);

    expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    expect(firstTx.userProgress.create).not.toHaveBeenCalled();
    expect(secondTx.userProfile.create).toHaveBeenCalledWith({
      data: { userId: user.id, nickname: 'demo_444444' },
    });
    expect(secondTx.userProgress.create).toHaveBeenCalledWith({
      data: { userId: user.id },
    });
  });
});
