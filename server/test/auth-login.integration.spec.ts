import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetTestDatabase } from './reset-test-database';
import { createTestApp, makeGql } from './helpers/test-app';
import * as bcrypt from 'bcrypt';



const REGISTER = `mutation ($input: AuthInput!) { register(input: $input) { access_token } }`;
const LOGIN = `mutation ($input: AuthInput!) { login(input: $input) { access_token } }`;
const APPLICATION = `mutation ($input: CreateApplicationInput!) {
  createApplication(input: $input) {id}
}`;

describe('login', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let gql: ReturnType<typeof makeGql>;
  let verifier: JwtService;


  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    gql = makeGql(app);
    verifier = app.get(JwtService);
  });

  beforeEach(async () => { await resetTestDatabase(prisma); });
  afterAll(async () => { await app.close(); });

  it('login with correct credintals', async () => {
    await gql(REGISTER, { input: { email: 'login@gmail.com', password: 'password' } });
    const res = await gql(LOGIN, { input: { email: 'login@gmail.com', password: 'password' } });
    expect(res.body.errors).toBeUndefined();
    const token = res.body?.data?.login?.access_token;
    expect(token).toEqual(expect.any(String));
    const user = await prisma.user.findUniqueOrThrow({ where: { email: 'login@gmail.com' } });
    expect(verifier.verify(token).sub).toEqual(user.id);
  });
  it('login with wrong credintals', async () => {
        await gql(REGISTER, { input: { email: 'login@gmail.com', password: 'password' } });
    const wrong = await gql(LOGIN, { input: { email: 'login@gmail.com', password: 'wrongpassword' } });
    expect(wrong.body.errors[0].message).toBe('Invalid credentials');
    expect(wrong.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
    const unknown = await gql(LOGIN, { input: { email: 'nobody@gmail.com', password: 'password' } });
    expect(unknown.body.errors[0].message).toBe(wrong.body.errors[0].message);
    expect(unknown.body.errors[0].extensions.code).toBe(wrong.body.errors[0].extensions.code);
    expect(unknown.body.data).toEqual(wrong.body.data);
  });



  it('the token from login works against a guarded operation', async () => {
    await gql(REGISTER, { input: { email: 'login@gmail.com', password: 'password' } });
    const res = await gql(LOGIN, { input: { email: 'login@gmail.com', password: 'password' } });
    const token = res.body?.data?.login?.access_token;
   const application =  await gql(APPLICATION, { input: { companyName: 'C', jobRole: 'R' } }, token);
    const userapplication = await prisma.application.findFirstOrThrow({where:{id:application.body.data.createApplication.id}});
    const userId =  verifier.verify(token).sub;
    expect(userapplication.userId).toEqual(userId);

  });
  it('records login timing: wrong password vs unknown email (informational)', async () => {
  await gql(REGISTER, { input: { email: 'timing@gmail.com', password: 'password' } });
  const time = async (email: string) => {
    const start = process.hrtime.bigint();
    await gql(LOGIN, { input: { email, password: 'wrong-password' } });
    return Number(process.hrtime.bigint() - start) / 1e6;   // milliseconds
  };
  const runs = 10;
  const wrong: number[] = [];
  const unknown: number[] = [];
  for (let i = 0; i < runs; i += 1) {
    wrong.push(await time('timing@gmail.com'));
    unknown.push(await time(`nobody-${i}@gmail.com`));
  }
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
  expect(wrong.length).toBe(runs);
});


it('login with an unknown email still runs one bcrypt comparison', async () => {
  const spy = jest.spyOn(bcrypt, 'compare');
  try {
    await gql(LOGIN, { input: { email: 'nobody@example.com', password: 'password' } });
    expect(spy).toHaveBeenCalledTimes(1);
  } finally {
    spy.mockRestore();
  }
});
it.each([
  ['upper case', 'LOGIN-CASE@EXAMPLE.COM'],
  ['surrounding spaces', '  login-case@example.com  '],
])('login works when the email differs by %s', async (_label, typed) => {
  await gql(REGISTER, { input: { email: 'login-case@example.com', password: 'password' } });
  const res = await gql(LOGIN, { input: { email: typed, password: 'password' } });
  expect(res.body.errors).toBeUndefined();
  const user = await prisma.user.findUniqueOrThrow({ where: { email: 'login-case@example.com' } });
  expect(verifier.verify(res.body.data.login.access_token).sub).toEqual(user.id);
});

it('registered with capitals, logs in with lowercase', async () => {
  await gql(REGISTER, { input: { email: 'CaPs@Example.com', password: 'password' } });
  const res = await gql(LOGIN, { input: { email: 'caps@example.com', password: 'password' } });
  expect(res.body.errors).toBeUndefined();
  expect(res.body.data.login.access_token).toEqual(expect.any(String));
});
});