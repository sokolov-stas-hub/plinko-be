import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { BigIntInterceptor } from '../../src/common/interceptors/bigint.interceptor';

function ensureAvatarEnv() {
  process.env.AVATAR_STORAGE_ENDPOINT ??= 'https://example.r2.cloudflarestorage.com';
  process.env.AVATAR_STORAGE_REGION ??= 'auto';
  process.env.AVATAR_STORAGE_BUCKET ??= 'plinko-avatars';
  process.env.AVATAR_STORAGE_ACCESS_KEY_ID ??= 'test-key';
  process.env.AVATAR_STORAGE_SECRET_ACCESS_KEY ??= 'test-secret';
  process.env.AVATAR_PUBLIC_BASE_URL ??= 'https://cdn.example.com';
}

describe('Progression (e2e)', () => {
  let app: INestApplication;
  let access = '';

  beforeAll(async () => {
    ensureAvatarEnv();

    const { AppModule } = await import('../../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalInterceptors(new BigIntInterceptor());
    await app.init();

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `progression_${Date.now()}@test.local`, password: 'hunter22' });
    access = reg.body.accessToken;
  });

  afterAll(async () => app.close());

  it('returns level, daily bonus, daily missions, and starter missions', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/progression/me')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);

    expect(res.body.level).toBe(1);
    expect(res.body.xp).toBe(0);
    expect(res.body.daily.canClaim).toBe(true);
    expect(res.body.daily.reward.credits).toBe('500000000');
    expect(res.body.missions.daily).toHaveLength(3);
    expect(res.body.missions.starter.map((m: { key: string }) => m.key)).toContain('first_bet');
  });

  it('claims daily bonus once and updates balance and XP', async () => {
    const claim = await request(app.getHttpServer())
      .post('/api/v1/progression/daily/claim')
      .set('Authorization', `Bearer ${access}`)
      .expect(201);

    expect(claim.body.reward.source).toBe('DAILY_BONUS');
    expect(claim.body.reward.credits).toBe('500000000');
    expect(claim.body.reward.xp).toBe(25);
    expect(claim.body.reward.balanceAfter).toBe('10500000000');
    expect(claim.body.progression.xp).toBe(25);
    expect(claim.body.progression.daily.canClaim).toBe(false);

    await request(app.getHttpServer())
      .post('/api/v1/progression/daily/claim')
      .set('Authorization', `Bearer ${access}`)
      .expect(409);
  });
});
