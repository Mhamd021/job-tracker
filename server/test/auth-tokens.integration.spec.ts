import { INestApplication } from "@nestjs/common";
import * as request from 'supertest';
import { PrismaService } from "../src/prisma/prisma.service";
import { assertTestDatabase } from "./assert-test-database";
import { AppModule } from "../src/app.module";
import { resetTestDatabase } from "./reset-test-database";
import { Test } from "@nestjs/testing";
import { CreateApplicationInput } from "../src/applications/dto/create-application.input";
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';


describe('auth tokens', () => {

    let app: INestApplication;
    let prisma: PrismaService;
    let otherSigner: JwtService;
    let realSigner: JwtService;
    const someId = '00000000-0000-0000-0000-000000000001';

    const gql = (query: string, variables: object = {}, token?: string) => {
        const req = request(app.getHttpServer()).post('/graphql');
        if (token) req.set('Authorization', `Bearer ${token}`);
        return req.send({ query, variables });
    };
    const gqlWithHeader = (query: string, variables: object, header?: string) => {
        const req = request(app.getHttpServer()).post('/graphql');
        if (header !== undefined) req.set('Authorization', header);
        return req.send({ query, variables });
    };
    const tamper = (token: string, newSub: string): string => {
        const [header, payload, signature] = token.split('.');
        const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
        claims.sub = newSub;
        const newPayload = Buffer.from(JSON.stringify(claims)).toString('base64url');
        return `${header}.${newPayload}.${signature}`;
    };
    const expectRejected = async (header: string) => {
        const res = await gqlWithHeader(
            APPLICATION,
            { input: { companyName: 'X', jobRole: 'Y' } },
            header,
        );


        expect(res.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
        expect(await prisma.application.count()).toBe(0);
    };
    const expectAccepted = async (header: string) => {
        const res = await gqlWithHeader(
            APPLICATION,
            { input: { companyName: 'X', jobRole: 'Y' } },
            header,
        );
        expect(res.body.errors).toBeUndefined();
        expect(await prisma.application.count()).toBe(1);
    };

    const REGISTER = `
  mutation ($input: AuthInput!) {
    register(input: $input) { access_token }
  }
`;

    const APPLICATION = `mutation ($input: CreateApplicationInput!) {
  createApplication(input: $input) {id}
}`;

    const register = async (email: string): Promise<string> => {
        const response = await gql(REGISTER, {
            input: { email, password: 'password-for-tests' },
        });
        const token = response.body?.data?.register?.access_token;
        if (!token) {
            throw new Error(
                `register failed: ${JSON.stringify(response.body.errors ?? response.body)}`,
            );
        }
        return token;
    };

    const createApplication = async (input: CreateApplicationInput, token: string): Promise<string> => {
        const response = await gql(APPLICATION, {
            input
        }, token);
        const id = response.body?.data?.createApplication?.id;
        if (!id) {
            throw new Error(
                `create application failed: ${JSON.stringify(response.body.errors ?? response.body)}`,
            );
        }
        return id;
    };




    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
        prisma = app.get(PrismaService);
        await assertTestDatabase(prisma);
        const secret = app.get(ConfigService).get<string>('JWT_SECRET');
        if (!secret) throw new Error('JWT_SECRET is not set in the test environment');
        otherSigner = new JwtService({ secret: 'a-different-secret-for-tests' });
        realSigner = new JwtService({ secret });
    });

    beforeEach(async () => {
        await resetTestDatabase(prisma);
    });

    afterAll(async () => {
        await app.close();
    });


    it('control: a token built by the test with the real secret is accepted', async () => {
        const user = await prisma.user.create({
            data: { email: 'control@example.com', password: 'not-used' },
        });
        const token = realSigner.sign({ sub: user.id, email: user.email });
        const id = await createApplication({ companyName: 'C', jobRole: 'R' }, token);
        const row = await prisma.application.findUnique({ where: { id } });
        expect(row?.userId).toBe(user.id);


    });

    it('garbage token', async () => {
        await expectRejected('Bearer not-a-jwt');
    });
    it('tampered', async () => {
        await register('attacker@gmail.com');
        const attacker = await prisma.user.findUniqueOrThrow({ where: { email: 'attacker@gmail.com' } });
        await register('victim@gmail.com');
        const victim = await prisma.user.findUniqueOrThrow({ where: { email: 'victim@gmail.com' } });
        const valid = realSigner.sign({ sub: attacker.id, email: attacker.email });
        await expectRejected('Bearer ' + tamper(valid, victim.id));
        expect(await prisma.application.findMany({ where: { userId: victim.id } })).toEqual([]);
    });
    it('wrong secret', async () => {

        await register('victim@gmail.com');
        const victim = await prisma.user.findUniqueOrThrow({ where: { email: 'victim@gmail.com' } });
        await expectRejected('Bearer ' + otherSigner.sign({ sub: victim.id, email: victim.email }));
        expect(await prisma.application.findMany({ where: { userId: victim.id } })).toEqual([]);
    });


    it('expried token', async () => {
        const victim = await prisma.user.create({
            data: { email: 'expired@example.com', password: 'not-used' },
        });
        const token = realSigner.sign({
            sub: victim.id,
            email: victim.email,
            exp: Math.floor(Date.now() / 1000) - 60,
        });
        await expectRejected('Bearer ' + token);
        expect(await prisma.application.findMany({ where: { userId: victim.id } })).toEqual([]);
    });

    it('Unsigned token', async () => {
        const victim = await prisma.user.create({
            data: { email: 'unsigned@example.com', password: 'not-used' },
        });
        const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
        const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${b64({ sub: victim.id, email: victim.email })}.`;
        await expectRejected('Bearer ' + unsigned);
        expect(await prisma.application.findMany({ where: { userId: victim.id } })).toEqual([]);
    });

    it('Empty token', async () => {

        await expectRejected('Bearer ');

    });

    it('rejects a non-Bearer scheme', async () => {
        const user = await prisma.user.create({
            data: { email: 'scheme@example.com', password: 'not-used' },
        });
        const token = realSigner.sign({ sub: user.id, email: user.email });
        await expectRejected('Basic ' + token);

    });

    it('rejects extra parts after the token', async () => {
        const user = await prisma.user.create({
            data: { email: 'extra@example.com', password: 'not-used' },
        });
        const token = realSigner.sign({ sub: user.id, email: user.email });
        await expectRejected('Bearer ' + token + ' extra');

    });
    it('accepts the scheme in lowercase', async () => {
        const user = await prisma.user.create({
            data: { email: 'lowercase@example.com', password: 'not-used' },
        });
        const token = realSigner.sign({ sub: user.id, email: user.email });

        await expectAccepted('bearer ' + token);
    });

    it('rejects a token signed with another HMAC algorithm', async () => {
  const user = await prisma.user.create({
    data: { email: 'hs512@example.com', password: 'not-used' },
  });
  const token = realSigner.sign({ sub: user.id, email: user.email }, { algorithm: 'HS512' });
  const header = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString('utf8'));
  expect(header.alg).toBe('HS512');
  await expectRejected('Bearer ' + token);
});

it('a token without a sub cannot read other users data', async () => {
  const victim = await prisma.user.create({ data: { email: 'victim2@example.com', password: 'x' } });
  await prisma.application.create({
    data: { userId: victim.id, companyName: 'Secret', jobRole: 'Role' },
  });
  const noSub = realSigner.sign({ email: 'nosub@example.com' });     

  const res = await gqlWithHeader(`query { applications { id companyName } }`, {}, 'Bearer ' + noSub);
  expect(res.body.data).toBeNull();
 expect(res.body.errors?.[0]?.extensions?.code).toBe('UNAUTHENTICATED');
  expect(JSON.stringify(res.body)).not.toContain('Secret');
});
});