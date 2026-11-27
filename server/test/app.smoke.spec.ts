import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { TEST_DATABASE_NAME } from './test-database.guard';
import { assertTestDatabase } from './assert-test-database';

describe('app boots against the test database', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    await assertTestDatabase(prisma);
  });

  afterAll(async () => {
    await app.close();
  });

  it('is connected to the job_tracker_test database', async () => {
    const row = await prisma.$queryRaw<{ current_database: string }[]>`SELECT current_database()`;
    expect(row[0].current_database).toBe(TEST_DATABASE_NAME);
  });

  it('answers the health query over HTTP', async () => {
    const response = await request(app.getHttpServer())
      .post('/graphql')
      .send({ query: 'query { health }' })
      .expect(200);
    expect(response.body.data.health).toBe('ok');
  });
});