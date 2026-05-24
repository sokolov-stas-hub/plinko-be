import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { randomBytes } from 'crypto';
import { defaultNicknameBase } from '../profile/nickname';
import { PrismaService } from '../prisma/prisma.service';
import { SeedsService } from '../seeds/seeds.service';

export const INITIAL_USER_BALANCE = 10_000_000_000n;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly seeds: SeedsService,
  ) {}

  findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  findById(id: string) {
    return this.prisma.user.findUnique({ where: { id } });
  }

  private async uniqueDefaultNickname(tx: Prisma.TransactionClient, email: string): Promise<string> {
    const base = defaultNicknameBase(email);
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const suffix = randomBytes(3).toString('hex');
      const nickname = `${base}_${suffix}`.slice(0, 20);
      const existing = await tx.userProfile.findUnique({ where: { nickname } });
      if (!existing) return nickname;
    }
    return `player_${randomBytes(6).toString('hex')}`.slice(0, 20);
  }

  /** Creates a user AND their initial ACTIVE seed in one transaction. */
  async createWithSeed(email: string, passwordHash: string): Promise<User> {
    return this.prisma.$transaction(async tx => {
      const user = await tx.user.create({
        data: { email, passwordHash, balance: INITIAL_USER_BALANCE },
      });
      await this.seeds.createForUser(tx as unknown as Prisma.TransactionClient, user.id);
      const nickname = await this.uniqueDefaultNickname(tx as Prisma.TransactionClient, email);
      await tx.userProfile.create({ data: { userId: user.id, nickname } });
      await tx.userProgress.create({ data: { userId: user.id } });
      return user;
    });
  }
}
