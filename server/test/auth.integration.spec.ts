import { INestApplication } from "@nestjs/common";
import * as request from 'supertest';
import { PrismaService } from "../src/prisma/prisma.service";
import { assertTestDatabase } from "./assert-test-database";
import { AppModule } from "../src/app.module";
import { resetTestDatabase } from "./reset-test-database";
import { Test } from "@nestjs/testing";
import { CreateApplicationInput } from "../src/applications/dto/create-application.input";

describe('auth', () => {

    let app: INestApplication;
    let prisma: PrismaService;

    const gql = (query: string, variables: object = {}, token?: string) => {
        const req = request(app.getHttpServer()).post('/graphql');
        if (token) req.set('Authorization', `Bearer ${token}`);
        return req.send({ query, variables });
    };
    const REGISTER = `
  mutation ($input: AuthInput!) {
    register(input: $input) { access_token }
  }
`;

    const APPLICATION = `mutation ($input: CreateApplicationInput!) {
  createApplication(input: $input) {id}
}`;

    const UPDATE_APPLICATION = `mutation ($input: UpdateApplicationInput!) {
  updateApplication(input: $input) { id companyName }
}`;
    const DELETE_APPLICATION = `mutation ($id: ID!) {
  deleteApplication(id: $id) { id }
}`;

    const READAPPLICATION = `query ($id:ID!)
{
    application(id :$id) {id,userId}
}`;
    const READAPPLICATIONS = `query { applications { id userId } }`;
    const READ_STATS = `query { stats { total byStatus { status count } } }`;


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

    const deleteApplication = async (id: string) => {
        const response = await gql(DELETE_APPLICATION, { id: id });
        return response;
    }

    beforeAll(async () => {
        const moduleRef = await Test.createTestingModule({
            imports: [AppModule],
        }).compile();
        app = moduleRef.createNestApplication();
        await app.init();
        prisma = app.get(PrismaService);
        await assertTestDatabase(prisma);
    });

    beforeEach(async () => {
        await resetTestDatabase(prisma);
    });

    afterAll(async () => {
        await app.close();
    });

    const guarded: [string, string, object][] = [
        ['applications', READAPPLICATIONS, {}],
        ['application', READAPPLICATION, { id: '00000000-0000-0000-0000-000000000000' }],
        ['stats', READ_STATS, {}],
        ['createApplication', APPLICATION, { input: { companyName: 'X', jobRole: 'Y' } }],
        ['updateApplication', UPDATE_APPLICATION, { input: { id: '00000000-0000-0000-0000-000000000000', companyName: 'Z' } }],
        ['deleteApplication', DELETE_APPLICATION, { id: '00000000-0000-0000-0000-000000000000' }],
    ];

    it.each(guarded)('%s without a token is rejected', async (name, query, variables) => {
        const res = await gql(query, variables);
        expect(res.body.errors).toBeDefined();
        expect(res.body.errors[0].extensions.code).toBe('UNAUTHENTICATED');
        expect(res.body.data?.[name] ?? null).toBeNull();
        expect(await prisma.application.count()).toEqual(0);
    });

    it('test delete an exisiting application without token', async () => {
        const user = await register('user@gmail.com');
        const application = await createApplication(
            { companyName: 'userA Company', jobRole: 'userA Role' },
            user
        );
        await deleteApplication(application);
        expect(await prisma.application.count()).toEqual(1);
        expect(await prisma.application.findFirst({where : {id:application}})).not.toBeNull();

    });

});