import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateApplicationInput } from './dto/create-application.input';
import { UpdateApplicationInput } from './dto/update-application.input';

@Injectable()
export class ApplicationsService {
  constructor(private prisma: PrismaService) {}

  findAll(userId: string, status?: string) {
    return this.prisma.application.findMany({
      where: {
        userId,
        ...(status && { status: status as any }),
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  findOne(id: string, userId: string) {
    return this.prisma.application.findFirst({
      where: { id, userId },
    });
  }

  create(userId: string, input: CreateApplicationInput) {
    return this.prisma.application.create({
      data: { ...input, userId },
    });
  }

  update(userId: string, input: UpdateApplicationInput) {
    const { id, ...data } = input;
    return this.prisma.application.update({
      where: { id, userId },
      data,
    });
  }

  delete(id: string, userId: string) {
    return this.prisma.application.delete({
      where: { id, userId },
    });
  }

  async stats(userId: string) {
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