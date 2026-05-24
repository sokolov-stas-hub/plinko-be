import { PutObjectCommand } from '@aws-sdk/client-s3';
import { BadGatewayException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sharp from 'sharp';
import { AvatarStorageService } from './avatar-storage.service';

describe('AvatarStorageService', () => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
    'base64',
  );
  const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==', 'base64');
  const cfg = {
    getOrThrow: jest.fn((key: string) => {
      const values: Record<string, string> = {
        AVATAR_STORAGE_BUCKET: 'avatar-bucket',
        AVATAR_PUBLIC_BASE_URL: 'https://cdn.example.com/',
        AVATAR_STORAGE_ENDPOINT: 'https://example.r2.cloudflarestorage.com',
        AVATAR_STORAGE_REGION: 'auto',
        AVATAR_STORAGE_ACCESS_KEY_ID: 'test-key',
        AVATAR_STORAGE_SECRET_ACCESS_KEY: 'test-secret',
      };
      return values[key];
    }),
  } as unknown as ConfigService;

  it('maps invalid image bytes to BadRequestException', async () => {
    const service = new AvatarStorageService(cfg);

    await expect(service.uploadAvatar('user-1', Buffer.from('not image'))).rejects.toThrow(BadRequestException);
    await expect(service.uploadAvatar('user-1', Buffer.from('not image'))).rejects.toThrow('avatar image is invalid');
  });

  it('rejects valid images with unsupported decoded formats', async () => {
    const service = new AvatarStorageService(cfg);

    await expect(service.uploadAvatar('user-1', gif)).rejects.toThrow(BadRequestException);
    await expect(service.uploadAvatar('user-1', gif)).rejects.toThrow('avatar image must be a JPEG, PNG, or WebP image');
  });

  it('maps images over the decoded pixel limit to BadRequestException', async () => {
    const image = await sharp({
      create: {
        width: 4097,
        height: 4097,
        channels: 3,
        background: '#ffffff',
      },
    })
      .png()
      .toBuffer();
    const service = new AvatarStorageService(cfg);
    const send = jest.fn().mockResolvedValue({});
    Object.defineProperty(service, 's3', { value: { send } });

    await expect(service.uploadAvatar('user-1', image)).rejects.toThrow(BadRequestException);
    await expect(service.uploadAvatar('user-1', image)).rejects.toThrow('avatar image is invalid');
    expect(send).not.toHaveBeenCalled();
  });

  it('maps storage failures to BadGatewayException', async () => {
    const service = new AvatarStorageService(cfg);
    const send = jest.fn().mockRejectedValue(new Error('storage down'));
    Object.defineProperty(service, 's3', { value: { send } });

    await expect(service.uploadAvatar('user-1', png)).rejects.toThrow(BadGatewayException);
    await expect(service.uploadAvatar('user-1', png)).rejects.toThrow('Avatar storage unavailable');
  });

  it('uploads normalized WebP avatars with immutable cache headers', async () => {
    const service = new AvatarStorageService(cfg);
    const send = jest.fn().mockResolvedValue({});
    Object.defineProperty(service, 's3', { value: { send } });

    const result = await service.uploadAvatar('user-1', png);

    expect(result.avatarKey).toMatch(/^avatars\/user-1\/.+\.webp$/);
    expect(result.avatarUrl).toBe(`https://cdn.example.com/${result.avatarKey}`);
    expect(send).toHaveBeenCalledTimes(1);
    const command = send.mock.calls[0][0] as PutObjectCommand;
    expect(command.input).toMatchObject({
      Bucket: 'avatar-bucket',
      Key: result.avatarKey,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    });
    expect(Buffer.isBuffer(command.input.Body)).toBe(true);
  });
});
