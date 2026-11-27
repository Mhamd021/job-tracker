import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicationInput } from './dto/create-application.input';
import { UpdateApplicationInput } from './dto/update-application.input';
import { UnauthorizedException } from '@nestjs/common';

function requireUserId(userId: unknown): string {
  if (typeof userId !== 'string' || userId.length === 0) {
    throw new UnauthorizedException();
  }
  return userId;
}

@Injectable()
export class ApplicationsService {
  constructor(private prisma: PrismaService) {}

 async  findAll(userId: string, status?: string) {
    userId = requireUserId(userId);
    return this.prisma.application.findMany({
      where: {
        userId,
        ...(status && { status: status as any }),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

 async  findOne(id: string, userId: string) {
        userId = requireUserId(userId);

    return this.prisma.application.findFirst({
      where: { id, userId },
    });
  }

  async create(userId: string, input: CreateApplicationInput) {
        userId = requireUserId(userId);

    return this.prisma.application.create({
      data: { ...input, userId },
    });
  }

  async update(userId: string, input: UpdateApplicationInput) {
        userId = requireUserId(userId);

    const { id, ...data } = input;
    return this.prisma.application.update({
      where: { id, userId },
      data,
    });
  }

  async  delete(id: string, userId: string) {
        userId = requireUserId(userId);

    return this.prisma.application.delete({
      where: { id, userId },
    });
  }
  async stats(userId: string) {
        userId = requireUserId(userId);

    const all = await this.prisma.application.groupBy({
      by: ['status'],
      where: { userId },
      _count: { status: true },
    });

    const total = all.reduce((sum, s) => sum + s._count.status, 0);
    const byStatus = all.map(s => ({
      status: s.status,
      count: s._count.status,
    }));

    return { total, byStatus };
  }
}