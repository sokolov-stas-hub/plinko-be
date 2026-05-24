import { Test } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../../src/app.module';
import { BigIntInterceptor } from '../../src/common/interceptors/bigint.interceptor';
import { PrismaService } from '../../src/prisma/prisma.service';

describe('Profile (e2e)', () => {
  let app: INestApplication;
  let access = '';

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1', { exclude: ['health'] });
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }));
    app.useGlobalInterceptors(new BigIntInterceptor());
    await app.init();

    const prisma = app.get(PrismaService);
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
});
