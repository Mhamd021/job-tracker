import { ConflictException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}
    normalizeEmail(email: string) { return email.trim().toLowerCase(); }

  async findByEmail(email: string) {
    email = this.normalizeEmail(email);
    return this.prisma.user.findUnique({ where: { email } });
  }

 async create(email: string, hashedPassword: string) {
    email = this.normalizeEmail(email);
    try {
      return await this.prisma.user.create({ data: { email, password: hashedPassword } });
    } catch (err: unknown) {
      if (this.isUniqueViolation(err)) {
        throw new ConflictException('Email already in use');
      }
      throw err;
    }
  }

  private isUniqueViolation(err: unknown): boolean {
    return typeof err === 'object' && err !== null && 'code' in err && err.code === 'P2002';
  }
}