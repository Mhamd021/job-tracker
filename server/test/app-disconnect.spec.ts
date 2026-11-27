import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertTestDatabase } from './assert-test-database';
import { getTestDatabaseUrl } from './test-database.guard';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('prisma releases its connections on shutdown', () => {
  let verifier: Client;

  beforeAll(async () => {
    verifier = new Client({ connectionString: getTestDatabaseUrl() });
    await verifier.connect();
  });

  afterAll(async () => {
    await verifier.end();
  });

  const countAppConnections = async () => {
    const { rows } = await verifier.query(
      `SELECT count(*)::int AS n FROM pg_stat_activity
       WHERE datname = $1 AND pid <> pg_backend_pid()`,
      ['job_tracker_test'],
    );
    return rows[0].n as number;
  };

  it('has no app connections after app.close()', async () => {
    expect(await countAppConnections()).toBe(0);
    let app: INestApplication;
    let prisma: PrismaService;


    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await assertTestDatabase(prisma);


   expect(await countAppConnections()).toBeGreaterThan(0);

    await app.close();


    const start = Date.now();
    while (Date.now() - start < 3000) {
      if ((await countAppConnections()) === 0) {
        break;
      }
      await sleep(100);
    }
    expect(await countAppConnections()).toBe(0);
  });
});