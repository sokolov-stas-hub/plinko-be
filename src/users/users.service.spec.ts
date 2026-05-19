import { UsersService } from './users.service';
import { PrismaService } from '../prisma/prisma.service';
import { SeedsService } from '../seeds/seeds.service';

describe('UsersService', () => {
  it('creates new users with enough balance for demo bets', async () => {
    const user = {
      id: 'user-1',
      email: 'demo@test.local',
      passwordHash: 'hash',
      balance: 10_000_000_000n,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const tx = {
      user: {
        create: jest.fn().mockResolvedValue(user),
      },
    };
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
  });
});
