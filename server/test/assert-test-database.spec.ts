import { assertTestDatabase } from './assert-test-database';
import { PrismaService } from '../src/prisma/prisma.service';

const fakePrisma = (rows: { db: string }[]) =>
  ({ $queryRaw: jest.fn().mockResolvedValue(rows) }) as unknown as PrismaService;

describe('assertTestDatabase', () => {
  it('resolves when connected to the test database', async () => {
    await expect(
      assertTestDatabase(fakePrisma([{ db: 'job_tracker_test' }])),
    ).resolves.toBeUndefined();
  });

  it('rejects when connected to the dev database', async () => {
    await expect(
      assertTestDatabase(fakePrisma([{ db: 'job_tracker' }])),
    ).rejects.toThrow(
      'Expected test database to be job_tracker_test, but found job_tracker',
    );
  });

  it('rejects with a clear message when the query returns no rows', async () => {
    await expect(assertTestDatabase(fakePrisma([]))).rejects.toThrow(
      'Expected test database to be job_tracker_test',
    );
  });
});