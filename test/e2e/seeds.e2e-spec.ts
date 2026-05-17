import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { createHash, createHmac } from 'crypto';
import { AppModule } from '../../src/app.module';
import { BigIntInterceptor } from '../../src/common/interceptors/bigint.interceptor';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Seeds (e2e)', () => {
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
      .send({ email: `seeds_${Date.now()}@t.local`, password: 'hunter22' });
    access = reg.body.accessToken;
    userId = reg.body.user.id;
    await prisma.user.update({ where: { id: userId }, data: { balance: 10_000_000_000n } });
  });

  afterAll(async () => app.close());

  it('player can update client seed at nonce=0', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/seeds/client')
      .set('Authorization', `Bearer ${access}`)
      .send({ clientSeed: 'mine' })
      .expect(204);
    const active = await request(app.getHttpServer())
      .get('/api/v1/seeds/active')
      .set('Authorization', `Bearer ${access}`)
      .expect(200);
    expect(active.body.clientSeed).toBe('mine');
  });

  it('rotates and reveals — verifies hash and reproduces past bet', async () => {
    // Place one bet so nonce becomes 1
    const bet = await request(app.getHttpServer())
      .post('/api/v1/bets')
      .set('Authorization', `Bearer ${access}`)
      .send({ amount: '1000000', rows: 10, risk: 'HIGH' })
      .expect(201);
    const expectedHash = bet.body.seed.serverSeedHash;
    const usedNonce = bet.body.seed.nonce;
    const usedClient = bet.body.seed.clientSeed;
    const path = bet.body.path;

    const rot = await request(app.getHttpServer())
      .post('/api/v1/seeds/rotate')
      .set('Authorization', `Bearer ${access}`)
      .send({})
      .expect(201);
    const reveal = await request(app.getHttpServer())
      .get(`/api/v1/seeds/${rot.body.revealed.id}`)
      .set('Authorization', `Bearer ${access}`)
      .expect(200);

    // Verify commitment
    expect(createHash('sha256').update(reveal.body.serverSeed).digest('hex')).toBe(expectedHash);

    // Re-run the play algorithm and confirm path matches
    const h = createHmac('sha256', reveal.body.serverSeed).update(`${usedClient}:${usedNonce}`).digest();
    const reconstructed = Array.from(h.slice(0, 10)).map(b => (b < 128 ? 'L' : 'R')).join('');
    expect(reconstructed).toBe(path);
  });

  it('rejects client-seed update after nonce > 0', async () => {
    // Place one more bet on the NEW active seed (advances its nonce)
    await request(app.getHttpServer())
      .post('/api/v1/bets')
      .set('Authorization', `Bearer ${access}`)
      .send({ amount: '1000000', rows: 10, risk: 'HIGH' })
      .expect(201);
    await request(app.getHttpServer())
      .post('/api/v1/seeds/client')
      .set('Authorization', `Bearer ${access}`)
      .send({ clientSeed: 'late' })
      .expect(400);
  });
});
