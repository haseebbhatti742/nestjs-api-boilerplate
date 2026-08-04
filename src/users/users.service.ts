import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcrypt';
import { Repository } from 'typeorm';
import { AuthenticatedUser } from '../common/types/express';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { User, UserRole } from './entities/user.entity';

const BCRYPT_COST_FACTOR = 12;

export interface PaginatedUsers {
  items: User[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly usersRepository: Repository<User>,
  ) {}

  async findAll(page: number, limit: number): Promise<PaginatedUsers> {
    const [items, total] = await this.usersRepository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return { items, total, page, limit };
  }

  async findOne(id: string, currentUser: AuthenticatedUser): Promise<User> {
    this.assertSelfOrAdmin(id, currentUser);

    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepository
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  async findById(id: string): Promise<User | null> {
    return this.usersRepository.findOne({ where: { id } });
  }

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.usersRepository.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already in use');
    }

    const hashedPassword = await bcrypt.hash(dto.password, BCRYPT_COST_FACTOR);

    const user = this.usersRepository.create({
      email: dto.email,
      password: hashedPassword,
      roles: [UserRole.USER],
    });

    const saved = await this.usersRepository.save(user);
    delete (saved as { password?: string }).password;
    return saved;
  }

  async update(
    id: string,
    dto: UpdateUserDto,
    currentUser: AuthenticatedUser,
  ): Promise<User> {
    this.assertSelfOrAdmin(id, currentUser);

    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (dto.email) {
      user.email = dto.email;
    }
    if (dto.password) {
      user.password = await bcrypt.hash(dto.password, BCRYPT_COST_FACTOR);
    }

    const saved = await this.usersRepository.save(user);
    delete (saved as { password?: string }).password;
    return saved;
  }

  async remove(id: string): Promise<void> {
    const user = await this.usersRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }

    await this.usersRepository.softDelete(id);
  }

  private assertSelfOrAdmin(
    targetId: string,
    currentUser: AuthenticatedUser,
  ): void {
    const isSelf = currentUser.id === targetId;
    const isAdmin = currentUser.roles.includes(UserRole.ADMIN);

    if (!isSelf && !isAdmin) {
      throw new ForbiddenException();
    }
  }
}
