import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { BigIntInterceptor } from '../../src/common/interceptors/bigint.interceptor';
import { PrismaService } from '../../src/prisma/prisma.service';

function ensureAvatarEnv() {
  process.env.AVATAR_STORAGE_ENDPOINT ??= 'https://example.r2.cloudflarestorage.com';
  process.env.AVATAR_STORAGE_REGION ??= 'auto';
  process.env.AVATAR_STORAGE_BUCKET ??= 'plinko-avatars';
  process.env.AVATAR_STORAGE_ACCESS_KEY_ID ??= 'test-key';
  process.env.AVATAR_STORAGE_SECRET_ACCESS_KEY ??= 'test-secret';
  process.env.AVATAR_PUBLIC_BASE_URL ??= 'https://cdn.example.com';
}

describe('Bets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let access = '';
  let userId = '';

  beforeAll(async () => {
    ensureAvatarEnv();

    const { AppModule } = await import('../../src/app.module');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalInterceptors(new BigIntInterceptor());
    await app.init();
    prisma = app.get(PrismaService);

    const email = `bets_${Date.now()}@t.local`;
    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, password: 'hunter22' });
    access = reg.body.accessToken;
    userId = reg.body.user.id;

    await prisma.user.update({ where: { id: userId }, data: { balance: 10_000_000_000n } });
  });

  afterAll(async () => app.close());

  it('rejects bet below MIN_BET', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/bets')
      .set('Authorization', `Bearer ${access}`)
      .send({ amount: '1', rows: 10, risk: 'HIGH' })
      .expect(400);
  });

  it('places a bet and returns deterministic fields', async () => {
    const startingBalance = 10_000_000_000n;
    await prisma.user.update({ where: { id: userId }, data: { balance: startingBalance } });
    await prisma.userMissionProgress.deleteMany({ where: { userId } });

    const res = await request(app.getHttpServer())
      .post('/api/v1/bets')
      .set('Authorization', `Bearer ${access}`)
      .send({ amount: '1000000', rows: 10, risk: 'HIGH' })
      .expect(201);
    expect(res.body.path).toHaveLength(10);
    expect(res.body.bucketIndex).toBeGreaterThanOrEqual(0);
    expect(res.body.bucketIndex).toBeLessThanOrEqual(10);
    expect(BigInt(res.body.balanceAfter)).toBe(startingBalance - 1_000_000n + BigInt(res.body.payout));
    expect(Array.isArray(res.body.progressionEvents)).toBe(true);
    expect(
      res.body.progressionEvents.some(
        (e: { type: string }) => e.type === 'MISSION_COMPLETED' || e.type === 'MISSION_PROGRESS',
      ),
    ).toBe(true);
    expect(res.body.progressionEvents.some((e: { key?: string }) => e.key === 'first_bet')).toBe(true);

    const progression = await request(app.getHttpServer())
      .get('/api/v1/progression/me')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);
    const firstBetMission = progression.body.missions.starter.find((m: { key: string }) => m.key === 'first_bet');
    expect(firstBetMission.status).toMatch(/COMPLETED|CLAIMED/);
  });

  it('rejects bet with insufficient balance', async () => {
    await prisma.user.update({ where: { id: userId }, data: { balance: 0n } });
    await request(app.getHttpServer())
      .post('/api/v1/bets')
      .set('Authorization', `Bearer ${access}`)
      .send({ amount: '1000000', rows: 10, risk: 'HIGH' })
      .expect(402);
  });

  it('lists history with filters and pagination', async () => {
    await prisma.user.update({ where: { id: userId }, data: { balance: 100_000_000_000n } });
    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post('/api/v1/bets')
        .set('Authorization', `Bearer ${access}`)
        .send({ amount: '1000000', rows: 10, risk: 'HIGH' });
    }
    const res = await request(app.getHttpServer())
      .get('/api/v1/bets?limit=2&risk=HIGH&rows=10')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);
    expect(res.body.items).toHaveLength(2);
    expect(res.body.nextCursor).toBeDefined();
  });
});
