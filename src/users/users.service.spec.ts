import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from './entities/user.entity';
import { UsersService } from './users.service';

type MockRepository = Partial<Record<keyof Repository<User>, jest.Mock>>;

const createMockRepository = (): MockRepository => ({
  findOne: jest.fn(),
  findAndCount: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  softDelete: jest.fn(),
  createQueryBuilder: jest.fn(),
});

describe('UsersService', () => {
  let service: UsersService;
  let repository: MockRepository;

  const admin = { id: 'admin-id', email: 'admin@example.com', roles: [UserRole.ADMIN] };
  const self = { id: 'user-id', email: 'user@example.com', roles: [UserRole.USER] };
  const stranger = { id: 'stranger-id', email: 'stranger@example.com', roles: [UserRole.USER] };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: createMockRepository() },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    repository = module.get(getRepositoryToken(User));
  });

  describe('create', () => {
    it('rejects a duplicate email', async () => {
      repository.findOne!.mockResolvedValue({ id: 'existing' } as User);

      await expect(
        service.create({ email: self.email, password: 'password123' }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('hashes the password and strips it from the returned user', async () => {
      repository.findOne!.mockResolvedValue(null);
      repository.create!.mockImplementation((data) => data);
      repository.save!.mockImplementation((data) =>
        Promise.resolve({ ...data, id: 'new-id' }),
      );

      const result = await service.create({
        email: self.email,
        password: 'password123',
      });

      expect(result.password).toBeUndefined();
      expect(repository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          password: expect.not.stringMatching('password123'),
        }),
      );
    });
  });

  describe('findOne (self-or-admin authorization)', () => {
    it('allows a user to fetch their own profile', async () => {
      repository.findOne!.mockResolvedValue({ id: self.id } as User);

      await expect(service.findOne(self.id, self)).resolves.toBeDefined();
    });

    it('allows an admin to fetch any profile', async () => {
      repository.findOne!.mockResolvedValue({ id: self.id } as User);

      await expect(service.findOne(self.id, admin)).resolves.toBeDefined();
    });

    it('rejects a non-admin fetching someone else\'s profile', async () => {
      await expect(service.findOne(self.id, stranger)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(repository.findOne).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the user does not exist', async () => {
      repository.findOne!.mockResolvedValue(null);

      await expect(service.findOne(self.id, self)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('soft-deletes rather than hard-deletes', async () => {
      repository.findOne!.mockResolvedValue({ id: self.id } as User);

      await service.remove(self.id);

      expect(repository.softDelete).toHaveBeenCalledWith(self.id);
    });

    it('throws NotFoundException for a nonexistent user', async () => {
      repository.findOne!.mockResolvedValue(null);

      await expect(service.remove(self.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
