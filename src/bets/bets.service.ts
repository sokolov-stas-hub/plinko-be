import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Bet, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressionService } from '../progression/progression.service';
import { SeedsService } from '../seeds/seeds.service';
import { WalletService } from '../wallet/wallet.service';
import { play } from '../game/engine';
import { Risk } from '../game/types';

@Injectable()
export class BetsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seeds: SeedsService,
    private readonly wallet: WalletService,
    private readonly progression: ProgressionService,
    private readonly cfg: ConfigService,
  ) {}

  async placeBet(userId: string, amount: bigint, rows: number, risk: Risk) {
    const minBet = this.cfg.getOrThrow<bigint>('MIN_BET');
    const maxBet = this.cfg.getOrThrow<bigint>('MAX_BET');
    if (amount < minBet || amount > maxBet) {
      throw new BadRequestException(`amount must be between ${minBet} and ${maxBet}`);
    }

    return this.prisma.$transaction(
      async tx => {
        const seed = await this.seeds.lockActiveForUpdate(tx, userId);
        const nonceAtBet = seed.nonce;
        const result = play(seed.serverSeed, seed.clientSeed, nonceAtBet, rows, risk);
        const payout = this.wallet.computePayout(amount, result.multiplier);
        const { balanceAfter } = await this.wallet.lockAndApply(tx, userId, amount, payout);
        await this.seeds.advanceNonce(tx, seed.id, nonceAtBet + 1);

        const bet = await tx.bet.create({
          data: {
            userId,
            seedId: seed.id,
            nonce: nonceAtBet,
            amount,
            rows,
            risk,
            path: result.path.join(''),
            bucketIndex: result.bucketIndex,
            multiplier: new Prisma.Decimal(result.multiplier),
            payout,
            balanceAfter,
          },
        });
        const progressionEvents = await this.progression.recordBet(tx, userId, {
          amount: bet.amount,
          payout: bet.payout,
          multiplier: Number(bet.multiplier),
          risk: bet.risk,
        });

        return {
          betId: bet.id,
          amount: bet.amount,
          rows: bet.rows,
          risk: bet.risk,
          path: bet.path,
          bucketIndex: bet.bucketIndex,
          multiplier: bet.multiplier.toString(),
          payout: bet.payout,
          balanceAfter: bet.balanceAfter,
          seed: {
            serverSeedHash: seed.serverSeedHash,
            clientSeed: seed.clientSeed,
            nonce: nonceAtBet,
          },
          progressionEvents: progressionEvents.map(event => ({
            type: event.type,
            missionId: event.missionId,
            key: event.missionKey,
            progress: event.progress,
            target: event.target,
          })),
        };
      },
      { maxWait: 30_000, timeout: 30_000 },
    );
  }

  async list(userId: string, q: { limit?: number; cursor?: string; risk?: Risk; rows?: number }) {
    const limit = q.limit ?? 20;
    const where: Prisma.BetWhereInput = { userId };
    if (q.risk) where.risk = q.risk;
    if (q.rows) where.rows = q.rows;

    const items = await this.prisma.bet.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return {
      items: page.map(b => this.serialize(b)),
      nextCursor: hasMore ? page[page.length - 1].id : null,
    };
  }

  async getById(userId: string, betId: string) {
    const b = await this.prisma.bet.findUnique({ where: { id: betId } });
    if (!b) throw new NotFoundException('Bet not found');
    if (b.userId !== userId) throw new ForbiddenException();
    return this.serialize(b);
  }

  private serialize(b: Bet) {
    return {
      betId: b.id,
      amount: b.amount,
      rows: b.rows,
      risk: b.risk,
      path: b.path,
      bucketIndex: b.bucketIndex,
      multiplier: b.multiplier.toString(),
      payout: b.payout,
      balanceAfter: b.balanceAfter,
      createdAt: b.createdAt,
    };
  }
}
