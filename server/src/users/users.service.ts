import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}
    normalizeEmail(email: string) { return email.toLowerCase(); }

  async findByEmail(email: string) {
    email = this.normalizeEmail(email);
    return this.prisma.user.findUnique({ where: { email } });
  }

  async create(email: string, hashedPassword: string) {
    email = this.normalizeEmail(email);
    return this.prisma.user.create({
      data: { email, password: hashedPassword },
    });
  }
}