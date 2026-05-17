import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { BigIntInterceptor } from '../../src/common/interceptors/bigint.interceptor';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Bets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let access = '';
  let userId = '';

  beforeAll(async () => {
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
    const res = await request(app.getHttpServer())
      .post('/api/v1/bets')
      .set('Authorization', `Bearer ${access}`)
      .send({ amount: '1000000', rows: 10, risk: 'HIGH' })
      .expect(201);
    expect(res.body.path).toHaveLength(10);
    expect(res.body.bucketIndex).toBeGreaterThanOrEqual(0);
    expect(res.body.bucketIndex).toBeLessThanOrEqual(10);
    expect(BigInt(res.body.balanceAfter)).toBeLessThan(10_000_000_000n);
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
