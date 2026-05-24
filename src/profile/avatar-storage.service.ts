import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { BadGatewayException, BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import sharp from 'sharp';

const SUPPORTED_AVATAR_FORMATS = new Set(['jpeg', 'png', 'webp']);

@Injectable()
export class AvatarStorageService {
  private readonly bucket: string;
  private readonly publicBaseUrl: string;
  private readonly s3: S3Client;

  constructor(cfg: ConfigService) {
    this.bucket = cfg.getOrThrow<string>('AVATAR_STORAGE_BUCKET');
    this.publicBaseUrl = cfg.getOrThrow<string>('AVATAR_PUBLIC_BASE_URL');
    this.s3 = new S3Client({
      endpoint: cfg.getOrThrow<string>('AVATAR_STORAGE_ENDPOINT'),
      region: cfg.getOrThrow<string>('AVATAR_STORAGE_REGION'),
      credentials: {
        accessKeyId: cfg.getOrThrow<string>('AVATAR_STORAGE_ACCESS_KEY_ID'),
        secretAccessKey: cfg.getOrThrow<string>('AVATAR_STORAGE_SECRET_ACCESS_KEY'),
      },
    });
  }

  async uploadAvatar(userId: string, image: Buffer): Promise<{ avatarKey: string; avatarUrl: string }> {
    let format: string | undefined;
    try {
      ({ format } = await sharp(image).metadata());
    } catch {
      throw new BadRequestException('avatar image is invalid');
    }
    if (!format || !SUPPORTED_AVATAR_FORMATS.has(format)) {
      throw new BadRequestException('avatar image must be a JPEG, PNG, or WebP image');
    }

    let webp: Buffer;
    try {
      webp = await sharp(image).resize(256, 256, { fit: 'cover' }).webp({ quality: 82 }).toBuffer();
    } catch {
      throw new BadRequestException('avatar image is invalid');
    }

    const avatarKey = `avatars/${userId}/${randomUUID()}.webp`;

    try {
      await this.s3.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: avatarKey,
          Body: webp,
          ContentType: 'image/webp',
          CacheControl: 'public, max-age=31536000, immutable',
        }),
      );
    } catch {
      throw new BadGatewayException('Avatar storage unavailable');
    }

    return {
      avatarKey,
      avatarUrl: `${this.publicBaseUrl.replace(/\/$/, '')}/${avatarKey}`,
    };
  }
}
