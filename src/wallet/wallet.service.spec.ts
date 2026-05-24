import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { WalletService } from './wallet.service';

describe('WalletService', () => {
  it('returns balance - amount + payout', () => {
    const svc = new WalletService();
    expect(svc.computeBalanceAfter(10_000n, 1000n, 2500n)).toBe(11_500n);
  });

  it('throws when balance < amount', () => {
    const svc = new WalletService();
    expect(() => svc.computeBalanceAfter(500n, 1000n, 0n)).toThrow();
  });

  it('floor-rounds payout from multiplier', () => {
    const svc = new WalletService();
    // amount 1000 * multiplier 0.2 = 200
    expect(svc.computePayout(1000n, 0.2)).toBe(200n);
    // 1000 * 1.1 = 1100
    expect(svc.computePayout(1000n, 1.1)).toBe(1100n);
    // 333 * 0.7 = 233.1 → 233
    expect(svc.computePayout(333n, 0.7)).toBe(233n);
  });

  it('credits rewards while holding the user row lock', async () => {
    const service = new WalletService();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([{ balance: 1_000_000n }]),
      user: { update: jest.fn().mockResolvedValue(undefined) },
    };

    const result = await service.lockAndCredit(
      tx as unknown as Prisma.TransactionClient,
      'user-1',
      500_000n,
    );

    expect(result).toEqual({ balanceBefore: 1_000_000n, balanceAfter: 1_500_000n });
    const [sqlTemplate] = tx.$queryRaw.mock.calls[0] as [TemplateStringsArray, string];
    expect(sqlTemplate.join('')).toMatch(/\bFOR\s+UPDATE\b/i);
    expect(tx.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { balance: 1_500_000n },
    });
  });

  it('rejects reward credits when the user cannot be locked', async () => {
    const service = new WalletService();
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      user: { update: jest.fn() },
    };

    const credit = service.lockAndCredit(
      tx as unknown as Prisma.TransactionClient,
      'user-1',
      500_000n,
    );

    await expect(credit).rejects.toThrow(BadRequestException);
    await expect(credit).rejects.toThrow('User not found');
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('rejects negative reward credit amounts', async () => {
    const service = new WalletService();
    const tx = {
      $queryRaw: jest.fn(),
      user: { update: jest.fn() },
    };

    await expect(
      service.lockAndCredit(tx as unknown as Prisma.TransactionClient, 'user-1', -1n),
    ).rejects.toThrow('creditAmount must be non-negative');
    expect(tx.$queryRaw).not.toHaveBeenCalled();
    expect(tx.user.update).not.toHaveBeenCalled();
  });
});
