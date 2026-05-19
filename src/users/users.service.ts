import { Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
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

  /** Creates a user AND their initial ACTIVE seed in one transaction. */
  async createWithSeed(email: string, passwordHash: string): Promise<User> {
    return this.prisma.$transaction(async tx => {
      const user = await tx.user.create({
        data: { email, passwordHash, balance: INITIAL_USER_BALANCE },
      });
      await this.seeds.createForUser(tx as unknown as Prisma.TransactionClient, user.id);
      return user;
    });
  }
}
