import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { assertTestDatabase } from './assert-test-database';
import { resetTestDatabase } from './reset-test-database';
import { CreateApplicationInput } from '../src/applications/dto/create-application.input';

describe('ownership', () => {
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

const APPLICATION = `mutation ($input: CreateApplicationInput!) {
  createApplication(input: $input) {id}
}`;
const createApplication = async (input: CreateApplicationInput, token:string): Promise<string> => {
  const response = await gql(APPLICATION, {
    input
    
  },token);
  const id = response.body?.data?.createApplication?.id;
  if (!id) {
    throw new Error(
      `create application failed: ${JSON.stringify(response.body.errors ?? response.body)}`,
    );
  }
  return id;
};

const READAPPLICATION = `query ($id:ID!)
{
    application(id :$id) {id,userId}
}`;
const readApplication = async(id:string,token:string) => 
  {
    const response = await gql(READAPPLICATION,{id:id},token );

    return response;
     
  }

  
const READAPPLICATIONS = `query { applications { id userId } }`;

const readApplications = async(token:string) =>
  {
    const response = await gql(READAPPLICATIONS,{},token );
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

// it('user A cannot read user B application by id', async () => {
//   const userAtoken = await register(`${Date.now()}-a@example.com`);
//   const userBtoken = await register(`${Date.now()}-b@example.com`);

//   const applicationId = await createApplication(
//     { companyName: 'userA Company', jobRole: 'userA Role' },
//     userAtoken,
//   );

//   // Control: the owner can read it. Without this, the test would also pass
//   // if the application had never been created.
//   const asOwner = await readApplication(applicationId, userAtoken);
//   expect(asOwner.body.errors).toBeUndefined();
//   expect(asOwner.body.data.application.id).toBe(applicationId);

//   // Ownership: B asks for A's id and must get "not found", not a crash.
//   const asOther = await readApplication(applicationId, userBtoken);
//   expect(asOther.body.errors).toBeUndefined();
//   expect(asOther.body.data.application).toBeNull();
// });

    it('user read applications wihtout leak', async () => {
  const userAtoken = await register(`${Date.now()}-a@example.com`);
  const userBtoken = await register(`${Date.now()}-b@example.com`);

  const applicationIdA1 = await createApplication(
    { companyName: 'userA Company', jobRole: 'userA Role' },
    userAtoken,
  );
  const applicationIdA2 = await createApplication(
    { companyName: 'userA Company2', jobRole: 'userA Role2' },
    userAtoken,
  );
   const applicationIdB1 = await createApplication(
    { companyName: 'userB Company', jobRole: 'userB Role' },
    userBtoken,
  );

  
  const asOwnerA = await readApplications(userAtoken);
  const ids = (res: { body: any }): string[] =>
  res.body.data.applications.map((a: { id: string }) => a.id).sort();
  
  expect(asOwnerA.body.errors).toBeUndefined();
  expect(asOwnerA.body.data.applications).toHaveLength(2);
  

expect(ids(asOwnerA)).toEqual([applicationIdA1, applicationIdA2].sort());

  const asOwnerB = await readApplications(userBtoken);
  expect(asOwnerB.body.errors).toBeUndefined();
  expect(asOwnerB.body.data.applications).toHaveLength(1);
  expect(ids(asOwnerB)).toEqual([applicationIdB1].sort());




});
    
    
    
    

  });
