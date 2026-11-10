import { PrismaService } from '../src/prisma/prisma.service';
import { assertTestDatabase } from './assert-test-database';
import { resetTestDatabase } from './reset-test-database';

describe('resetTestDatabase (real database)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    await assertTestDatabase(prisma);
  });

  afterAll(async () => {
    await prisma.onModuleDestroy();
  });
  beforeEach(async () => {
        await prisma.application.deleteMany();
    await prisma.user.deleteMany();
  });
  it('removes all users and applications', async () => {

        const user = await prisma.user.create({
            data: {
                email: `${Date.now()}@example.com`,
                password: 'password',
            }
        });
        await prisma.application.create({
            data: {
                companyName: 'Test Company',
                jobRole: 'Test Role',
                userId: user.id
            }
        });
    expect(await prisma.user.count()).toBe(1);
    expect(await prisma.application.count()).toBe(1);

    await resetTestDatabase(prisma);
    expect(await prisma.user.count()).toBe(0);
    expect(await prisma.application.count()).toBe(0);
  });
});