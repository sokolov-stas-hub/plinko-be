import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { addDuration } from './duration';
import { JwtAccessPayload, JwtRefreshPayload } from './types';
import { hashPassword, verifyPassword } from './password';
import { newJti, sha256 } from './tokens';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly cfg: ConfigService,
  ) {}

  async register(email: string, password: string) {
    if (await this.users.findByEmail(email)) {
      throw new ConflictException('Email already registered');
    }
    const passwordHash = await hashPassword(password);
    const user = await this.users.createWithSeed(email, passwordHash);
    const tokens = await this.issueTokens(user.id);
    return { user: { id: user.id, email: user.email }, ...tokens };
  }

  async login(email: string, password: string) {
    const user = await this.users.findByEmail(email);
    if (!user || !(await verifyPassword(password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    return this.issueTokens(user.id);
  }

  async refresh(refreshToken: string) {
    const payload = await this.verifyRefresh(refreshToken);
    const tokenHash = sha256(refreshToken);
    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored || stored.revokedAt || stored.expiresAt < new Date() || stored.userId !== payload.sub) {
      throw new UnauthorizedException('Invalid refresh token');
    }
    await this.prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date() },
    });
    return this.issueTokens(payload.sub);
  }

  async logout(refreshToken: string) {
    const tokenHash = sha256(refreshToken);
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(userId: string) {
    const accessPayload: JwtAccessPayload = { sub: userId, type: 'access' };
    const refreshJti = newJti();
    const refreshPayload: JwtRefreshPayload = { sub: userId, type: 'refresh', jti: refreshJti };

    const accessToken = await this.jwt.signAsync(accessPayload, {
      secret: this.cfg.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.cfg.getOrThrow<string>('JWT_ACCESS_TTL'),
    });
    const refreshTtl = this.cfg.getOrThrow<string>('JWT_REFRESH_TTL');
    const refreshToken = await this.jwt.signAsync(refreshPayload, {
      secret: this.cfg.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: refreshTtl,
    });

    await this.prisma.refreshToken.create({
      data: {
        userId,
        tokenHash: sha256(refreshToken),
        expiresAt: addDuration(new Date(), refreshTtl),
      },
    });

    return { accessToken, refreshToken };
  }

  private async verifyRefresh(token: string): Promise<JwtRefreshPayload> {
    try {
      const payload = await this.jwt.verifyAsync<JwtRefreshPayload>(token, {
        secret: this.cfg.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      if (payload.type !== 'refresh') throw new Error('wrong type');
      return payload;
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }
}
