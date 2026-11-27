import { PrismaService } from '../src/prisma/prisma.service';
import { resetTestDatabase } from './reset-test-database';

const fakePrisma = (rows: { db: string }[]) => {
  const executeRawUnsafe = jest.fn().mockResolvedValue(0);
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue(rows),
    $executeRawUnsafe: executeRawUnsafe,
  } as unknown as PrismaService;
  return { prisma, executeRawUnsafe };
};

describe('resetTestDatabaseFalseDatabase', () => {
  it('refuses to truncate when connected to the dev database', async () => {
    const { prisma, executeRawUnsafe } = fakePrisma([{ db: 'job_tracker' }]);
    await expect(resetTestDatabase(prisma)).rejects.toThrow(
      'Expected test database to be job_tracker_test, but found job_tracker'
    );
    expect(executeRawUnsafe).not.toHaveBeenCalled();

  });
});

  describe('resetTestDatabase', () => {
  it('truncates the test database when connected to the correct database', async () => {
    const { prisma, executeRawUnsafe } = fakePrisma([{ db: 'job_tracker_test' }]);
    await expect(resetTestDatabase(prisma)).resolves.toBeUndefined();
    expect(executeRawUnsafe).toHaveBeenCalledWith('TRUNCATE TABLE "Application", "User" CASCADE;');
    expect(executeRawUnsafe).toHaveBeenCalledTimes(1);
  });
});