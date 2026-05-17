import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { BigIntInterceptor } from '../../src/common/interceptors/bigint.interceptor';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Bets concurrency (e2e)', () => {
  jest.setTimeout(60_000);

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

    const reg = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email: `race_${Date.now()}@t.local`, password: 'hunter22' });
    access = reg.body.accessToken;
    userId = reg.body.user.id;
    await prisma.user.update({ where: { id: userId }, data: { balance: 1_000_000_000_000n } });
  });

  afterAll(async () => app.close());

  it('25 concurrent bets produce 25 unique nonces, no lost balance updates', async () => {
    const N = 25;
    const promises = Array.from({ length: N }).map(() =>
      request(app.getHttpServer())
        .post('/api/v1/bets')
        .set('Authorization', `Bearer ${access}`)
        .send({ amount: '1000000', rows: 10, risk: 'LOW' }),
    );
    const results = await Promise.all(promises);
    const successes = results.filter(r => r.status === 201);
    expect(successes).toHaveLength(N);

    const bets = await prisma.bet.findMany({ where: { userId } });
    const nonces = bets.map(b => b.nonce);
    expect(new Set(nonces).size).toBe(nonces.length);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    const totalIn = 1_000_000n * BigInt(N);
    const totalPayout = bets.reduce((s, b) => s + b.payout, 0n);
    expect(user!.balance).toBe(1_000_000_000_000n - totalIn + totalPayout);
  });
});
