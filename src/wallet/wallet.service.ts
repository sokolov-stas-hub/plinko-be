import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';

@Injectable()
export class WalletService {
  /** floor(amount * multiplier) using a 4-decimal fixed-point conversion. */
  computePayout(amount: bigint, multiplier: number): bigint {
    const m = BigInt(Math.round(multiplier * 10_000));
    return (amount * m) / 10_000n;
  }

  computeBalanceAfter(balance: bigint, amount: bigint, payout: bigint): bigint {
    if (balance < amount) {
      throw new HttpException('Insufficient balance', HttpStatus.PAYMENT_REQUIRED);
    }
    return balance - amount + payout;
  }

  /**
   * Within a Prisma transaction: locks the user row, validates funds, updates balance.
   * Returns { balanceBefore, balanceAfter }.
   */
  async lockAndApply(
    tx: Prisma.TransactionClient,
    userId: string,
    amount: bigint,
    payout: bigint,
  ): Promise<{ balanceBefore: bigint; balanceAfter: bigint }> {
    const rows = await tx.$queryRaw<{ balance: bigint }[]>`
      SELECT balance FROM "User" WHERE id = ${userId} FOR UPDATE
    `;
    if (rows.length === 0) throw new BadRequestException('User not found');
    const balanceBefore = rows[0].balance;
    const balanceAfter = this.computeBalanceAfter(balanceBefore, amount, payout);
    await tx.user.update({ where: { id: userId }, data: { balance: balanceAfter } });
    return { balanceBefore, balanceAfter };
  }

  async lockAndCredit(
    tx: Prisma.TransactionClient,
    userId: string,
    creditAmount: bigint,
  ): Promise<{ balanceBefore: bigint; balanceAfter: bigint }> {
    if (creditAmount < 0n) throw new BadRequestException('creditAmount must be non-negative');
    const rows = await tx.$queryRaw<{ balance: bigint }[]>`
      SELECT balance FROM "User" WHERE id = ${userId} FOR UPDATE
    `;
    if (rows.length === 0) throw new BadRequestException('User not found');
    const balanceBefore = rows[0].balance;
    const balanceAfter = balanceBefore + creditAmount;
    await tx.user.update({ where: { id: userId }, data: { balance: balanceAfter } });
    return { balanceBefore, balanceAfter };
  }
}
