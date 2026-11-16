import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetTestDatabase } from './reset-test-database';
import { createTestApp, makeGql } from './helpers/test-app';

const REGISTER = `mutation ($input: AuthInput!) { register(input: $input) { access_token } }`;

describe('registration', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let gql: ReturnType<typeof makeGql>;
  let verifier: JwtService;

  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    gql = makeGql(app);
    verifier = new JwtService({ secret: app.get(ConfigService).get<string>('JWT_SECRET') });
  });

  beforeEach(async () => { await resetTestDatabase(prisma); });
  afterAll(async () => { await app.close(); });

  it('stores a bcrypt hash, not the password, and returns a token for the new user', async () => {
    const email = 'new@example.com';
    const password = 'password-for-tests';
    const res = await gql(REGISTER, { input: { email, password } });
    const token = res.body?.data?.register?.access_token;

    expect(res.body.errors).toBeUndefined();

    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(user.password).not.toEqual(password);
    
    expect(user.password).toMatch(/^\$2[aby]\$\d{2}\$/);
    expect(user.password).toMatch(/^\$2[aby]\$10\$/);
    expect(await bcrypt.compare(password,user.password)).toEqual(true);
    expect(token).toEqual(expect.any(String));
    expect(verifier.verify(token).sub).toEqual(user.id);
    expect(verifier.verify(token).email).toEqual(user.email);
  });

  it('a second registration with the same email is refused and changes nothing', async () => {
  const email = 'dup@example.com';
  const first = await gql(REGISTER, { input: { email, password: 'first-password' } });
  expect(first.body.errors).toBeUndefined();
  const before = await prisma.user.findUniqueOrThrow({ where: { email } });

  const second = await gql(REGISTER, { input: { email, password: 'second-password' } });
  expect(second.body.errors).toBeDefined();
  expect(second.body.data).toBeNull();
  
  expect(second.body.errors[0].message).toBe('Email already in use');
  expect(second.body.errors[0]?.extensions?.code).toBe('INTERNAL_SERVER_ERROR');
  
  expect(await prisma.user.count({where:{email}})).toEqual(1);
    
  const user = await prisma.user.findFirstOrThrow({where:{email}});
  expect(before.password).toEqual(user.password);
});
});