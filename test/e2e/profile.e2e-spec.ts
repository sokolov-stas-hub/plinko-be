import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { BigIntInterceptor } from '../../src/common/interceptors/bigint.interceptor';
import { PrismaService } from '../../src/prisma/prisma.service';
import { AvatarStorageService } from '../../src/profile/avatar-storage.service';

function ensureAvatarEnv() {
  process.env.AVATAR_STORAGE_ENDPOINT ??= 'https://example.r2.cloudflarestorage.com';
  process.env.AVATAR_STORAGE_REGION ??= 'auto';
  process.env.AVATAR_STORAGE_BUCKET ??= 'plinko-avatars';
  process.env.AVATAR_STORAGE_ACCESS_KEY_ID ??= 'test-key';
  process.env.AVATAR_STORAGE_SECRET_ACCESS_KEY ??= 'test-secret';
  process.env.AVATAR_PUBLIC_BASE_URL ??= 'https://cdn.example.com';
}

describe('Profile (e2e)', () => {
  let app: INestApplication;
  let access = '';
  let userId = '';
  let prisma: PrismaService;
  const avatarStorage = {
    uploadAvatar: jest.fn().mockResolvedValue({
      avatarKey: 'avatars/user/avatar.webp',
      avatarUrl: 'https://cdn.example.com/avatars/user/avatar.webp',
    }),
  };

  beforeAll(async () => {
    ensureAvatarEnv();

    const { AppModule } = await import('../../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AvatarStorageService)
      .useValue(avatarStorage)
      .compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalInterceptors(new BigIntInterceptor());
    await app.init();

    prisma = app.get(PrismaService);
    for (const [index, nickname] of ['new_name_123', 'trimmed_name'].entries()) {
      await prisma.userProfile.updateMany({
        where: {
          nickname,
          user: { email: { endsWith: '@test.local' } },
        },
        data: { nickname: `old_${Date.now().toString(36)}_${index}`.slice(0, 20) },
      });
    }

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `profile_${Date.now()}@test.local`, password: 'hunter22' });
    access = reg.body.accessToken;
    userId = reg.body.user.id;
  });

  afterAll(async () => app.close());

  it('returns the authenticated profile aggregate', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/profile/me')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);

    expect(res.body.email).toContain('@test.local');
    expect(res.body.nickname).toEqual(expect.any(String));
    expect(res.body.avatarUrl).toBeNull();
    expect(res.body.balance).toBe('10000000000');
    expect(res.body.progression.level).toBe(1);
    expect(res.body.progression.xp).toBe(0);
    expect(res.body.progression.xpForCurrentLevel).toBe(0);
    expect(res.body.progression.xpForNextLevel).toBe(100);
    expect(res.body.progression.xpIntoCurrentLevel).toBe(0);
    expect(res.body.progression.dailyStreak).toBe(0);
  });

  it('updates nickname and rejects invalid values', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/profile/me')
      .set('Authorization', `Bearer ${access}`)
      .send({ nickname: 'new_name_123' })
      .expect(200)
      .expect(res => expect(res.body.nickname).toBe('new_name_123'));

    await request(app.getHttpServer())
      .patch('/api/v1/profile/me')
      .set('Authorization', `Bearer ${access}`)
      .send({ nickname: ' trimmed_name ' })
      .expect(200)
      .expect(res => expect(res.body.nickname).toBe('trimmed_name'));

    await request(app.getHttpServer())
      .patch('/api/v1/profile/me')
      .set('Authorization', `Bearer ${access}`)
      .send({ nickname: 'bad-name' })
      .expect(400);
  });

  it('uploads an avatar and returns updated profile', async () => {
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
      'base64',
    );

    await request(app.getHttpServer())
      .post('/api/v1/profile/avatar')
      .set('Authorization', `Bearer ${access}`)
      .attach('image', png, { filename: 'avatar.png', contentType: 'image/png' })
      .expect(201)
      .expect((res) => expect(res.body.avatarUrl).toBe('https://cdn.example.com/avatars/user/avatar.webp'));

    expect(avatarStorage.uploadAvatar).toHaveBeenCalledWith(userId, expect.any(Buffer));
    const profile = await prisma.userProfile.findUniqueOrThrow({ where: { userId } });
    expect(profile.avatarKey).toBe('avatars/user/avatar.webp');
    expect(profile.avatarUrl).toBe('https://cdn.example.com/avatars/user/avatar.webp');
    expect(profile.avatarUpdatedAt).toBeInstanceOf(Date);
  });

  it('rejects non-image avatar upload', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/profile/avatar')
      .set('Authorization', `Bearer ${access}`)
      .attach('image', Buffer.from('not image'), { filename: 'avatar.txt', contentType: 'text/plain' })
      .expect(400);
  });

  it('rejects oversized avatar upload', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/profile/avatar')
      .set('Authorization', `Bearer ${access}`)
      .attach('image', Buffer.alloc(2 * 1024 * 1024 + 1), { filename: 'avatar.png', contentType: 'image/png' })
      .expect(400)
      .expect((res) => expect(res.body.message).toBe('avatar image must be 2 MB or smaller'));
  });
});
