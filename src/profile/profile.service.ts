import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { describeLevel } from '../progression/level-curve';
import { PrismaService } from '../prisma/prisma.service';
import { AvatarStorageService } from './avatar-storage.service';
import { assertValidNickname, defaultNicknameBase } from './nickname';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileResponse } from './dto/profile.response';

type ProfileAggregate = Prisma.UserGetPayload<{
  include: { profile: true; progress: true };
}>;

const DEFAULT_NICKNAME_ATTEMPTS = 10;

@Injectable()
export class ProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly avatarStorage: AvatarStorageService,
  ) {}

  async getMe(userId: string): Promise<ProfileResponse> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true, progress: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return this.toResponse(user);
  }

  async updateMe(userId: string, dto: UpdateProfileDto): Promise<ProfileResponse> {
    const nickname = dto.nickname.trim();
    assertValidNickname(nickname);

    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          profile: {
            upsert: {
              create: { nickname },
              update: { nickname },
            },
          },
        },
        include: { profile: true, progress: true },
      });
      return this.toResponse(user);
    } catch (error) {
      if (this.isNicknameConflict(error)) {
        throw new ConflictException('Nickname already taken');
      }
      throw error;
    }
  }

  async uploadAvatar(userId: string, image: Buffer): Promise<ProfileResponse> {
    await this.ensureProfile(userId);
    const uploaded = await this.avatarStorage.uploadAvatar(userId, image);
    await this.prisma.userProfile.update({
      where: { userId },
      data: {
        avatarKey: uploaded.avatarKey,
        avatarUrl: uploaded.avatarUrl,
        avatarUpdatedAt: new Date(),
      },
    });
    return this.getMe(userId);
  }

  private async ensureProfile(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    if (user.profile) {
      return;
    }

    for (let attempt = 0; attempt < DEFAULT_NICKNAME_ATTEMPTS; attempt += 1) {
      const nickname = this.defaultNicknameCandidate(user.email, attempt);
      try {
        const existing = await this.prisma.userProfile.findUnique({ where: { nickname } });
        if (existing) continue;
        await this.prisma.userProfile.create({ data: { userId, nickname } });
        return;
      } catch (error) {
        if (!this.isNicknameConflict(error)) throw error;
      }
    }

    throw new ConflictException('Could not allocate a unique default nickname');
  }

  private defaultNicknameCandidate(email: string, attempt: number): string {
    if (attempt < 5) {
      return `${defaultNicknameBase(email)}_${randomBytes(3).toString('hex')}`.slice(0, 20);
    }
    return `player_${randomBytes(6).toString('hex')}`.slice(0, 20);
  }

  private isNicknameConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code !== 'P2002') return false;

    const target = error.meta?.target;
    if (Array.isArray(target)) return target.includes('nickname');
    return typeof target === 'string' && target.includes('nickname');
  }

  private toResponse(user: ProfileAggregate): ProfileResponse {
    const level = describeLevel(user.progress?.xp ?? 0);

    return {
      id: user.id,
      email: user.email,
      nickname: user.profile?.nickname ?? defaultNicknameBase(user.email),
      avatarUrl: user.profile?.avatarUrl ?? null,
      balance: user.balance,
      progression: {
        level: level.level,
        xp: level.xp,
        xpForCurrentLevel: level.xpForCurrentLevel,
        xpForNextLevel: level.xpForNextLevel,
        xpIntoCurrentLevel: level.xpIntoCurrentLevel,
        dailyStreak: user.progress?.dailyStreak ?? 0,
      },
    };
  }
}
