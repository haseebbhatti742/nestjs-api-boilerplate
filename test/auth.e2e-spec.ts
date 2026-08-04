import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { User } from '../src/users/entities/user.entity';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  const email = `auth-e2e-${Date.now()}@example.com`;
  const password = 'password123';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    userRepository = moduleFixture.get<Repository<User>>(
      getRepositoryToken(User),
    );
  });

  afterAll(async () => {
    await userRepository.delete({ email });
    await app.close();
  });

  describe('POST /auth/register', () => {
    it('rejects an invalid payload', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'short' })
        .expect(400);
    });

    it('registers a new user', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(201)
        .expect((res) => {
          expect(res.body.data.email).toBe(email);
          expect(res.body.data.password).toBeUndefined();
        });
    });

    it('rejects a duplicate email', () => {
      return request(app.getHttpServer())
        .post('/auth/register')
        .send({ email, password })
        .expect(409);
    });
  });

  describe('POST /auth/login', () => {
    it('rejects an unknown email', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'nobody@example.com', password })
        .expect(401);
    });

    it('rejects the wrong password', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password: 'wrong-password' })
        .expect(401);
    });

    it('logs in and sets an httpOnly refresh cookie', () => {
      return request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password })
        .expect(200)
        .expect((res) => {
          expect(res.body.data.accessToken).toBeDefined();
          const cookies = res.headers['set-cookie'] as unknown as string[];
          const refreshCookie = cookies.find((c) =>
            c.startsWith('refresh_token='),
          );
          expect(refreshCookie).toBeDefined();
          expect(refreshCookie).toMatch(/HttpOnly/i);
        });
    });
  });

  describe('GET /auth/me', () => {
    it('rejects requests without a token', () => {
      return request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('returns the current user with a valid access token', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password });
      const accessToken = loginRes.body.data.accessToken;

      return request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.email).toBe(email);
        });
    });
  });

  describe('POST /auth/refresh', () => {
    it('rejects requests without a refresh cookie', () => {
      return request(app.getHttpServer()).post('/auth/refresh').expect(401);
    });

    it('issues a new access token given a valid refresh cookie', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password });
      const cookies = loginRes.headers['set-cookie'] as unknown as string[];

      return request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', cookies)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.accessToken).toBeDefined();
        });
    });
  });

  describe('POST /auth/logout', () => {
    it('requires a valid access token', () => {
      return request(app.getHttpServer()).post('/auth/logout').expect(401);
    });

    it('clears the refresh cookie, but does not revoke it server-side', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email, password });
      const loginCookies = loginRes.headers[
        'set-cookie'
      ] as unknown as string[];
      const accessToken = loginRes.body.data.accessToken;

      const logoutRes = await request(app.getHttpServer())
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);
      const logoutCookies = logoutRes.headers[
        'set-cookie'
      ] as unknown as string[];
      expect(logoutCookies.some((c) => c.includes('refresh_token=;'))).toBe(
        true,
      );

      // Known, documented limitation (see AuthService.logout comment / CLAUDE.md
      // Redis-blacklist TODO): there is no server-side revocation, so the refresh
      // token captured before logout still works until it naturally expires.
      return request(app.getHttpServer())
        .post('/auth/refresh')
        .set('Cookie', loginCookies)
        .expect(200);
    });
  });
});
