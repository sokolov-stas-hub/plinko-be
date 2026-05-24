import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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

describe('Progression (e2e)', () => {
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

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `progression_${Date.now()}@test.local`, password: 'hunter22' });
    access = reg.body.accessToken;
    userId = reg.body.user.id;
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

    const afterDuplicate = await request(app.getHttpServer())
      .get('/api/v1/progression/me')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);
    expect(afterDuplicate.body.xp).toBe(25);
    expect(afterDuplicate.body.daily.canClaim).toBe(false);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(user.balance).toBe(10_500_000_000n);

    const ledgerCount = await prisma.progressionRewardLedger.count({
      where: {
        userId,
        source: 'DAILY_BONUS',
        sourceKey: claim.body.reward.sourceKey,
        periodKey: claim.body.reward.periodKey,
      },
    });
    expect(ledgerCount).toBe(1);
  });

  it('claims a completed mission once and updates balance and XP', async () => {
    const progression = await request(app.getHttpServer())
      .get('/api/v1/progression/me')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);
    const firstBet = progression.body.missions.starter.find((m: { key: string }) => m.key === 'first_bet');
    expect(firstBet.id).toEqual(expect.any(String));

    await prisma.userMissionProgress.update({
      where: { id: firstBet.id },
      data: { progress: 1, status: 'COMPLETED', completedAt: new Date() },
    });

    const beforeUser = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const beforeProgress = await prisma.userProgress.findUniqueOrThrow({ where: { userId } });

    const claim = await request(app.getHttpServer())
      .post(`/api/v1/progression/missions/${firstBet.id}/claim`)
      .set('Authorization', `Bearer ${access}`)
      .expect(201);

    expect(claim.body.reward.source).toBe('MISSION');
    expect(claim.body.reward.missionId).toBe(firstBet.id);
    expect(claim.body.reward.missionKey).toBe('first_bet');
    expect(claim.body.reward.credits).toBe('500000000');
    expect(claim.body.reward.xp).toBe(50);
    expect(claim.body.reward.balanceAfter).toBe((beforeUser.balance + 500_000_000n).toString());
    expect(claim.body.progression.xp).toBe(beforeProgress.xp + 50);
    expect(
      claim.body.progression.missions.starter.find((m: { key: string }) => m.key === 'first_bet').status,
    ).toBe('CLAIMED');

    await request(app.getHttpServer())
      .post(`/api/v1/progression/missions/${firstBet.id}/claim`)
      .set('Authorization', `Bearer ${access}`)
      .expect(409);

    const afterDuplicateUser = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
    expect(afterDuplicateUser.balance).toBe(beforeUser.balance + 500_000_000n);
    const afterDuplicateProgress = await prisma.userProgress.findUniqueOrThrow({ where: { userId } });
    expect(afterDuplicateProgress.xp).toBe(beforeProgress.xp + 50);
    expect(afterDuplicateProgress.level).toBe(claim.body.progression.level);

    const ledgerCount = await prisma.progressionRewardLedger.count({
      where: {
        userId,
        source: 'MISSION',
        sourceKey: 'first_bet',
        periodKey: 'starter',
      },
    });
    expect(ledgerCount).toBe(1);
  });
});
