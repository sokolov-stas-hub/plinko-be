import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma, User } from '@prisma/client';
import { randomBytes } from 'crypto';
import { defaultNicknameBase } from '../profile/nickname';
import { PrismaService } from '../prisma/prisma.service';
import { SeedsService } from '../seeds/seeds.service';

export const INITIAL_USER_BALANCE = 10_000_000_000n;
const DEFAULT_NICKNAME_REGISTRATION_ATTEMPTS = 10;

class DefaultNicknameCollisionError extends Error {}

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

  private defaultNicknameCandidate(email: string, attempt: number): string {
    if (attempt < 5) {
      return `${defaultNicknameBase(email)}_${randomBytes(3).toString('hex')}`.slice(0, 20);
    }
    return `player_${randomBytes(6).toString('hex')}`.slice(0, 20);
  }

  private isDefaultNicknameCollision(error: unknown): boolean {
    if (error instanceof DefaultNicknameCollisionError) return true;
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code !== 'P2002') return false;

    const target = error.meta?.target;
    if (Array.isArray(target)) return target.includes('nickname');
    return typeof target === 'string' && target.includes('nickname');
  }

  private async createProfile(tx: Prisma.TransactionClient, userId: string, nickname: string): Promise<void> {
    const existing = await tx.userProfile.findUnique({ where: { nickname } });
    if (existing) {
      throw new DefaultNicknameCollisionError();
    }
    await tx.userProfile.create({ data: { userId, nickname } });
  }

  /** Creates a user AND their initial ACTIVE seed in one transaction. */
  async createWithSeed(email: string, passwordHash: string): Promise<User> {
    for (let attempt = 0; attempt < DEFAULT_NICKNAME_REGISTRATION_ATTEMPTS; attempt += 1) {
      const nickname = this.defaultNicknameCandidate(email, attempt);
      try {
        return await this.prisma.$transaction(async tx => {
          const transaction = tx as Prisma.TransactionClient;
          const user = await tx.user.create({
            data: { email, passwordHash, balance: INITIAL_USER_BALANCE },
          });
          await this.seeds.createForUser(transaction, user.id);
          await this.createProfile(transaction, user.id, nickname);
          await tx.userProgress.create({ data: { userId: user.id } });
          return user;
        });
      } catch (error) {
        if (!this.isDefaultNicknameCollision(error)) throw error;
      }
    }

    throw new ConflictException('Could not allocate a unique default nickname');
  }
}
