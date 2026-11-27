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
    verifier = app.get(JwtService);
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
    expect(await bcrypt.compare(password, user.password)).toEqual(true);
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

    expect(await prisma.user.count({ where: { email } })).toEqual(1);

    const user = await prisma.user.findFirstOrThrow({ where: { email } });
    expect(before.password).toEqual(user.password);
  });

  it('two simultaneous registrations with the same email create exactly one user', async () => {
    const email = 'race@example.com';
    const passwords = ['password-one', 'password-two'];
    const responses = await Promise.all(
      passwords.map((password) => gql(REGISTER, { input: { email, password } })),
    );
    const tokenOf = (r: { body: any }): string | undefined =>
      r.body?.data?.register?.access_token;

    expect(responses.filter((r) => tokenOf(r))).toHaveLength(1);
    const winnerIndex = responses.findIndex((r) => tokenOf(r));
    const loserIndex = 1 - winnerIndex;
    const winners = responses.filter((r) => tokenOf(r));
    expect(winners.length).toBe(1);
    expect(responses[loserIndex].body.errors).toBeDefined();

    expect(await prisma.user.count({ where: { email } })).toEqual(1);
    const user = await prisma.user.findUniqueOrThrow({ where: { email } });
    expect(await bcrypt.compare(passwords[winnerIndex], user.password)).toBe(true);
    expect(await bcrypt.compare(passwords[loserIndex], user.password)).toBe(false);

    expect(verifier.verify(tokenOf(responses[winnerIndex])!).sub).toEqual(user.id);
  });

  it.failing(' [known bug]:the loser of a simultaneous registration gets "Email already in use"', async () => {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const email = `race-${attempt}@example.com`;
      const responses = await Promise.all(
        ['password-one', 'password-two'].map((password) =>
          gql(REGISTER, { input: { email, password } }),
        ),
      );
      const losers = responses.filter((r) => !r.body?.data?.register?.access_token);

      expect(losers.length).not.toBe(1);
      expect(losers[0].body?.errors?.[0]?.message).toBe('Email already in use');
    }
  });
 
  it(' the same email in another letter case is refused', async () => {
    await gql(REGISTER, { input: { email: 'A@Example.com', password: 'Apassword' } });
    const second = await gql(REGISTER, { input: { email: 'a@example.com', password: 'apassword' } });
    expect(second.body.errors).toBeDefined();
    expect(await prisma.user.count()).toEqual(1);
  });
 

  it('the registration response has no password or hash anywhere', async () => {
    const response = await gql(REGISTER, { input: { email: 'check@Example.com', password: 'password' } });
    const register = response.body?.data?.register;
    expect(register?.access_token).not.toBeNull();
    expect(Object.keys(register)).toHaveLength(1);
    expect(register.access_token).toEqual(expect.any(String))
  });

  it('no output type of the schema exposes a password field', async () => {
    const res = await gql(`query { __schema { types { name fields { name } } } }`);
    expect(res.body.errors).toBeUndefined();
    const exposing = res.body.data.__schema.types
      .filter((t: { fields: { name: string }[] | null }) => t.fields?.some((f) => f.name === 'password'))
      .map((t: { name: string }) => t.name);
    expect(exposing).toEqual([]);
  });

  it('the token returned by register expires 7 days after it is issued', async () => {
  const res = await gql(REGISTER, {
    input: { email: 'exp@example.com', password: 'password-for-tests' },
  });
  const token = res.body.data.register.access_token;
  const decoded = verifier.decode(token) as { iat: number; exp: number };
  expect(decoded.exp - decoded.iat).toBe(7 * 24 * 60 * 60);
});

  it('today: a malformed email and an empty password are accepted', async () => {
    const bad = await gql(REGISTER, { input: { email: 'not an email', password: 'password' } });
    const empty = await gql(REGISTER, { input: { email: 'empty@example.com', password: '' } });
    expect(bad.body.errors).toBeUndefined();
    expect(empty.body.errors).toBeUndefined();
  });

  it.failing('[known bug] : a malformed email is refused', async () => { 

     const false_email = await gql(REGISTER, { input: { email: 'not an email', password: 'password' } });
    expect(false_email.body.errors).toBeDefined();
    expect(await prisma.user.count({ where: { email: 'not an email' } })).toEqual(0);
   });

  it.failing('[known bug] an empty password is refused', async () => { 
    
    const empty_password = await gql(REGISTER, { input: { email: 'email@gmail.com', password: '' } });
    expect(empty_password.body.errors).toBeDefined();
    expect(await prisma.user.count({ where: { email: 'email@gmail.com' } })).toEqual(0);
   });
  
  it('today: only the first 72 bytes of a password count', async () => {
    const password = 'a'.repeat(72) + 'X';
    const Ypassword = 'a'.repeat(72) + 'Y';
    const Zpassword = 'a'.repeat(71) + 'Z';
    const res =  await gql(REGISTER, { input: { email: 'password@gmail.com', password } });
    expect(res.body.errors).toBeUndefined()
    const user = await prisma.user.findFirstOrThrow({where:{email: 'password@gmail.com'}});
    expect(await bcrypt.compare(password, user.password)).toEqual(true);
    expect(await bcrypt.compare(Ypassword, user.password)).toEqual(true);
    expect(await bcrypt.compare(Zpassword, user.password)).toEqual(false);

  });

  it('stores the email trimmed and in lowercase', async () => {
  const res = await gql(REGISTER, {
    input: { email: '  Mixed.Case@Example.COM  ', password: 'password-for-tests' },
  });
  expect(res.body.errors).toBeUndefined();
  const users = await prisma.user.findMany();
  expect(users.map((u) => u.email)).toEqual(['mixed.case@example.com']);
});

it.each([
  ['upper case', 'DUP@EXAMPLE.COM'],
  ['mixed case', 'Dup@Example.com'],
  ['surrounding spaces', '  dup@example.com  '],
])('a duplicate differing only by %s is refused', async (_label, second) => {
  const first = await gql(REGISTER, {
    input: { email: 'dup@example.com', password: 'first-password' },
  });
  expect(first.body.errors).toBeUndefined();
  const before = await prisma.user.findUniqueOrThrow({ where: { email: 'dup@example.com' } });

  const res = await gql(REGISTER, { input: { email: second, password: 'second-password' } });
  expect(res.body.errors?.[0]?.message).toBe('Email already in use');
  expect(await prisma.user.count()).toBe(1);
  const after = await prisma.user.findUniqueOrThrow({ where: { email: 'dup@example.com' } });
  expect(after.password).toEqual(before.password);
});
});