import { BadRequestException } from '@nestjs/common';

const VALID_NICKNAME = /^[A-Za-z0-9_]{3,20}$/;

export function defaultNicknameBase(email: string): string {
  const prefix = email.split('@')[0] ?? '';
  const normalized = prefix.replace(/[^A-Za-z0-9_]/g, '_').replace(/_+/g, '_').replace(/^_+|_+$/g, '');
  const base = normalized || 'player';
  return base.slice(0, 14);
}

export function assertValidNickname(nickname: string): void {
  if (nickname.length < 3 || nickname.length > 20) {
    throw new BadRequestException('nickname must be 3 to 20 characters');
  }
  if (!VALID_NICKNAME.test(nickname)) {
    throw new BadRequestException('nickname may contain only ASCII letters, digits, and underscore');
  }
}
