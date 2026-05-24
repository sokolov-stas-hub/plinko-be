import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertValidNickname, defaultNicknameBase } from './nickname';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { ProfileResponse } from './dto/profile.response';

type ProfileAggregate = Prisma.UserGetPayload<{
  include: { profile: true; progress: true };
}>;

@Injectable()
export class ProfileService {
  constructor(private readonly prisma: PrismaService) {}

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

  private isNicknameConflict(error: unknown): boolean {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code !== 'P2002') return false;

    const target = error.meta?.target;
    if (Array.isArray(target)) return target.includes('nickname');
    return typeof target === 'string' && target.includes('nickname');
  }

  private toResponse(user: ProfileAggregate): ProfileResponse {
    return {
      id: user.id,
      email: user.email,
      nickname: user.profile?.nickname ?? defaultNicknameBase(user.email),
      avatarUrl: user.profile?.avatarUrl ?? null,
      balance: user.balance,
      progression: {
        level: user.progress?.level ?? 1,
        dailyStreak: user.progress?.dailyStreak ?? 0,
      },
    };
  }
}
