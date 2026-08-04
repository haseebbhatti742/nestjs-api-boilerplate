import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { Repository } from 'typeorm';
import { AppModule } from '../src/app.module';
import { User, UserRole } from '../src/users/entities/user.entity';

describe('Users (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;

  const adminEmail = `users-e2e-admin-${Date.now()}@example.com`;
  const memberEmail = `users-e2e-member-${Date.now()}@example.com`;
  const otherEmail = `users-e2e-other-${Date.now()}@example.com`;
  const password = 'password123';

  let adminToken: string;
  let memberToken: string;
  let memberId: string;
  let otherId: string;

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

    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: adminEmail, password });
    const memberRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: memberEmail, password });
    const otherRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email: otherEmail, password });

    memberId = memberRes.body.data.id;
    otherId = otherRes.body.data.id;

    // No admin-creation endpoint is exposed (by design); promote directly via
    // the repository to simulate an already-provisioned admin account.
    await userRepository.update(
      { email: adminEmail },
      { roles: [UserRole.ADMIN] },
    );

    const adminLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: adminEmail, password });
    adminToken = adminLogin.body.data.accessToken;

    const memberLogin = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: memberEmail, password });
    memberToken = memberLogin.body.data.accessToken;
  });

  afterAll(async () => {
    await userRepository.delete({ email: adminEmail });
    await userRepository.delete({ email: memberEmail });
    await userRepository.delete({ email: otherEmail });
    await app.close();
  });

  describe('GET /users', () => {
    it('rejects unauthenticated requests', () => {
      return request(app.getHttpServer()).get('/users').expect(401);
    });

    it('rejects non-admin requests', () => {
      return request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });

    it('returns a paginated list for admins', () => {
      return request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body.data.items)).toBe(true);
          expect(typeof res.body.data.total).toBe('number');
          expect(res.body.data.page).toBe(1);
        });
    });
  });

  describe('GET /users/:id', () => {
    it('allows self access', () => {
      return request(app.getHttpServer())
        .get(`/users/${memberId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(200);
    });

    it('allows admin access to another user', () => {
      return request(app.getHttpServer())
        .get(`/users/${memberId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    });

    it('rejects non-admin, non-self access', () => {
      return request(app.getHttpServer())
        .get(`/users/${otherId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });

    it('returns 404 for a nonexistent user', () => {
      return request(app.getHttpServer())
        .get('/users/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);
    });
  });

  describe('PATCH /users/:id', () => {
    it('allows self-update of allowed fields', () => {
      return request(app.getHttpServer())
        .patch(`/users/${memberId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ email: `updated-${memberEmail}` })
        .expect(200)
        .expect((res) => {
          expect(res.body.data.email).toBe(`updated-${memberEmail}`);
        });
    });

    it('rejects attempts to send a roles field (not a whitelisted property)', () => {
      return request(app.getHttpServer())
        .patch(`/users/${memberId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ roles: [UserRole.ADMIN] })
        .expect(400);
    });

    it('rejects non-admin, non-self updates', () => {
      return request(app.getHttpServer())
        .patch(`/users/${otherId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .send({ email: 'hijacked@example.com' })
        .expect(403);
    });

    it('allows admin to update another user', () => {
      return request(app.getHttpServer())
        .patch(`/users/${otherId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ email: `updated-${otherEmail}` })
        .expect(200);
    });
  });

  describe('DELETE /users/:id', () => {
    it('rejects non-admin requests', () => {
      return request(app.getHttpServer())
        .delete(`/users/${otherId}`)
        .set('Authorization', `Bearer ${memberToken}`)
        .expect(403);
    });

    it('soft-deletes the user as admin', async () => {
      await request(app.getHttpServer())
        .delete(`/users/${otherId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      await request(app.getHttpServer())
        .get(`/users/${otherId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(404);

      const stillInDb = await userRepository.findOne({
        where: { id: otherId },
        withDeleted: true,
      });
      expect(stillInDb).not.toBeNull();
      expect(stillInDb?.deletedAt).toBeTruthy();
    });
  });
});
