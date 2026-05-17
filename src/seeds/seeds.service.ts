import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Seed, SeedStatus } from '@prisma/client';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export const randomServerSeed = () => randomBytes(32).toString('hex');
export const randomClientSeed = () => randomBytes(16).toString('hex');
export const hashServerSeed = (s: string) => createHash('sha256').update(s).digest('hex');

@Injectable()
export class SeedsService {
  constructor(private readonly prisma: PrismaService) {}

  async createForUser(
    tx: Prisma.TransactionClient | PrismaService,
    userId: string,
    clientSeed?: string,
  ): Promise<Seed> {
    const serverSeed = randomServerSeed();
    return tx.seed.create({
      data: {
        userId,
        serverSeed,
        serverSeedHash: hashServerSeed(serverSeed),
        clientSeed: clientSeed?.trim() || randomClientSeed(),
      },
    });
  }

  async getActiveForUser(userId: string): Promise<{
    serverSeedHash: string;
    clientSeed: string;
    nonce: number;
  }> {
    const s = await this.prisma.seed.findFirst({
      where: { userId, status: SeedStatus.ACTIVE },
    });
    if (!s) throw new NotFoundException('No active seed');
    return { serverSeedHash: s.serverSeedHash, clientSeed: s.clientSeed, nonce: s.nonce };
  }

  /** Used inside POST /bets transaction. Locks the row, returns it; caller advances nonce. */
  async lockActiveForUpdate(tx: Prisma.TransactionClient, userId: string): Promise<Seed> {
    const rows = await tx.$queryRaw<Seed[]>`
      SELECT * FROM "Seed"
      WHERE "userId" = ${userId} AND status = 'ACTIVE'
      FOR UPDATE
    `;
    if (rows.length === 0) throw new BadRequestException('No active seed');
    return rows[0];
  }

  async advanceNonce(tx: Prisma.TransactionClient, seedId: string, newNonce: number): Promise<void> {
    await tx.seed.update({ where: { id: seedId }, data: { nonce: newNonce } });
  }

  async updateClientSeed(userId: string, clientSeed: string): Promise<void> {
    const active = await this.prisma.seed.findFirst({
      where: { userId, status: SeedStatus.ACTIVE },
    });
    if (!active) throw new NotFoundException('No active seed');
    if (active.nonce !== 0) {
      throw new BadRequestException('Cannot change client seed after first bet; rotate instead');
    }
    await this.prisma.seed.update({
      where: { id: active.id },
      data: { clientSeed: clientSeed.trim() },
    });
  }

  /** Reveals current ACTIVE seed and creates a new one. Returns revealed seed (with raw serverSeed). */
  async rotate(userId: string, newClientSeed?: string): Promise<{
    revealed: { id: string; serverSeed: string; serverSeedHash: string; clientSeed: string; nonceMax: number };
    newActive: { serverSeedHash: string; clientSeed: string; nonce: number };
  }> {
    return this.prisma.$transaction(async tx => {
      const active = await tx.seed.findFirst({ where: { userId, status: SeedStatus.ACTIVE } });
      if (!active) throw new NotFoundException('No active seed');

      await tx.seed.update({
        where: { id: active.id },
        data: { status: SeedStatus.REVEALED, revealedAt: new Date() },
      });

      const fresh = await this.createForUser(tx, userId, newClientSeed);

      return {
        revealed: {
          id: active.id,
          serverSeed: active.serverSeed,
          serverSeedHash: active.serverSeedHash,
          clientSeed: active.clientSeed,
          nonceMax: active.nonce,
        },
        newActive: {
          serverSeedHash: fresh.serverSeedHash,
          clientSeed: fresh.clientSeed,
          nonce: fresh.nonce,
        },
      };
    });
  }

  async reveal(userId: string, seedId: string) {
    const s = await this.prisma.seed.findFirst({ where: { id: seedId, userId } });
    if (!s) throw new NotFoundException('Seed not found');
    if (s.status !== SeedStatus.REVEALED) {
      throw new BadRequestException('Seed is still ACTIVE; rotate before revealing');
    }
    return {
      id: s.id,
      serverSeed: s.serverSeed,
      serverSeedHash: s.serverSeedHash,
      clientSeed: s.clientSeed,
      nonceMax: s.nonce,
    };
  }
}
