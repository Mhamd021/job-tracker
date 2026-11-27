import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../src/app.module';
import { PrismaService } from '../../src/prisma/prisma.service';
import { assertTestDatabase } from '../assert-test-database';

export async function createTestApp() {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  await app.init();
  const prisma = app.get(PrismaService);
  try {
    await assertTestDatabase(prisma);
  } catch (error) {
    await app.close();   
    throw error;
  }
  return { app, prisma };
}

export const makeGql = (app: INestApplication) =>
  (query: string, variables: object = {}, token?: string) => {
    const req = request(app.getHttpServer()).post('/graphql');
    if (token) req.set('Authorization', `Bearer ${token}`);
    return req.send({ query, variables });
  };

 export async function registerUser(
  gql: ReturnType<typeof makeGql>, email: string, password = 'password-for-tests',
): Promise<string> {
  const res = await gql(
    `mutation ($input: AuthInput!) { register(input: $input) { access_token } }`,
    { input: { email, password } },
  );
  const token = res.body?.data?.register?.access_token;
  if (!token) throw new Error(`register failed: ${JSON.stringify(res.body.errors ?? res.body)}`);
  return token;
}