import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../src/prisma/prisma.service';
import { resetTestDatabase } from './reset-test-database';
import { createTestApp, makeGql, registerUser } from './helpers/test-app';


    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));


const APPLICATION = `mutation ($input: CreateApplicationInput!) {
  createApplication(input: $input) {id}
}`;
const READAPPLICATIONS = `query($status: Status) { applications(status: $status) { id userId } }`;
const UPDATE_APPLICATION = `mutation ($input: UpdateApplicationInput!) {
  updateApplication(input: $input) { id companyName }
}`;
const READ = `query ($id: ID!) { application(id: $id) { id } }`;
const DELETE = `mutation ($id: ID!) { deleteApplication(id: $id) { id } }`;

const STATS = `query { stats { total byStatus { status count } } }`;
const counts = (res: { body: any }): Record<string, number> =>
  Object.fromEntries(
    res.body.data.stats.byStatus.map((s: { status: string; count: number }) => [s.status, s.count]),
  );

describe('application', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let gql: ReturnType<typeof makeGql>;


  beforeAll(async () => {
    ({ app, prisma } = await createTestApp());
    gql = makeGql(app);
  });

  beforeEach(async () => { await resetTestDatabase(prisma); });
  afterAll(async () => { await app.close(); });

  it('test create application with default applied status', async () => {
    const token = await registerUser(gql, 'applied@gmail.com');
    const application = await gql(APPLICATION, { input: { companyName: 'C', jobRole: 'R' } }, token);
    expect(application.body.errors).toBeUndefined();
    const databaseapplication = await prisma.application.findFirstOrThrow({ where: { id: application.body.data.createApplication.id } });
    expect(databaseapplication.status).toBe('APPLIED');
  });
  
  it('today: a null status fails with INTERNAL_SERVER_ERROR', async () => 
    {
    const token = await registerUser(gql, 'null@gmail.com');
    const application = await gql(APPLICATION, { input: { companyName: 'C', jobRole: 'R', status: null } }, token);
    expect(application.body.errors).toBeDefined();
    expect(await prisma.application.count()).toBe(0);
    expect(application.body.errors?.[0]?.extensions?.code).toBe('INTERNAL_SERVER_ERROR');
  });

  it('test the status filter', async () => {
    const LIST = `query($status: Status) { applications(status: $status) { id status userId } }`;
    const tokenA = await registerUser(gql, 'filter@gmail.com');
    const tokenB = await registerUser(gql, 'filterB@gmail.com');

    const application1 = await gql(APPLICATION, { input: { companyName: 'C', jobRole: 'R', status: 'INTERVIEW' } }, tokenA);
    const idA1 = application1.body.data.createApplication.id;
    await gql(APPLICATION, { input: { companyName: 'C2', jobRole: 'R2' } }, tokenA);
    await gql(APPLICATION, { input: { companyName: 'C3', jobRole: 'R3', status: 'INTERVIEW' } }, tokenB);

    const res = await gql(LIST, { status: 'INTERVIEW' }, tokenA);
    expect(res.body.errors).toBeUndefined();
    const rows = res.body.data.applications;
    expect(rows.map((r: { id: string }) => r.id)).toEqual([idA1]);
    expect(rows.every((r: { status: string }) => r.status === 'INTERVIEW')).toBe(true);
  });


  it('test the list order after updating', async () => {

    const token = await registerUser(gql, 'update@gmail.com');
    const older = await gql(APPLICATION, { input: { companyName: 'older', jobRole: 'older' } }, token);
    await sleep(25);
    const newer = await gql(APPLICATION, { input: { companyName: 'C2', jobRole: 'R2' } }, token);
    const beforapplications = await gql(READAPPLICATIONS, {}, token);
    expect(beforapplications.body.data.applications[0].id).toEqual(newer.body.data.createApplication.id);
    await sleep(25);
    await gql(UPDATE_APPLICATION, { input: { id: older.body.data.createApplication.id, companyName: "updated" } }, token);
    const afterapplications = await gql(READAPPLICATIONS, {}, token);
    expect(afterapplications.body.data.applications[0].id).toEqual(older.body.data.createApplication.id);
  });

  it('test partial update', async () => {
  
    const token = await registerUser(gql, 'update@gmail.com');
    const original = await gql(APPLICATION, { input: { companyName: 'original', jobRole: 'original' ,notes:'original note'} }, token);
    const appId = original.body.data.createApplication.id;
    await gql(UPDATE_APPLICATION, { input: { id: appId, companyName: "updated" } }, token);
    const updated = await prisma.application.findFirstOrThrow({where:{id:appId}});
    expect(updated.companyName).toBe('updated');
    expect(updated.notes).toBe('original note');
    expect(updated.jobRole).toBe('original');
    expect(updated.status).toBe('APPLIED');

  });
  

  it('a null id in an update is refused by GraphQL', async () => {
  const token = await registerUser(gql, 'nullid@gmail.com');
  const res = await gql(UPDATE_APPLICATION, { input: { id: null, companyName: 'updated' } }, token);
  expect(res.body.errors?.[0]?.extensions?.code).toBe('BAD_USER_INPUT');
});

    it('update with only an id', async () => {
  
    const token = await registerUser(gql, 'emptyupdate@gmail.com');
    const application = await gql(APPLICATION, { input: { companyName: 'C', jobRole: 'R'} }, token);
    const id = application.body.data.createApplication.id;
     const before = await prisma.application.findUniqueOrThrow({ where: { id } });
      await sleep(25);
    const res = await gql(UPDATE_APPLICATION, { input: { id } }, token);
    expect(res.body.errors).toBeUndefined();    
    const after = await prisma.application.findUniqueOrThrow({ where: { id } });
  expect(after.companyName).toBe(before.companyName);
  expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());

  });

const calls: [string, (id: string, token: string) => ReturnType<typeof gql>, boolean][] = [
  ['read',   (id, token) => gql(READ, { id }, token), false],
  ['update', (id, token) => gql(UPDATE_APPLICATION, { input: { id, companyName: 'x' } }, token), true],
  ['delete', (id, token) => gql(DELETE, { id }, token), true],
];

it.each(calls)('%s answers the same for a foreign id and an unknown id', async (_name, call,expectsError) => {
  const tokenA = await registerUser(gql, 'owner@gmail.com');
  const tokenB = await registerUser(gql, 'stranger@gmail.com');
  const created = await gql(APPLICATION, { input: { companyName: 'C', jobRole: 'R' } }, tokenA);
  const foreignId = created.body.data.createApplication.id;
  const unknownId = '00000000-0000-0000-0000-000000000000';
  
  const foreign = await call(foreignId, tokenB);
  const unknown = await call(unknownId, tokenB);
  
  const row = await prisma.application.findUniqueOrThrow({ where: { id: foreignId } });
   expect(Boolean(foreign.body.errors)).toBe(expectsError);
    expect(Boolean(unknown.body.errors)).toBe(expectsError);
  expect(row.companyName).toBe('C');                      
  expect(foreign.body.data).toEqual(unknown.body.data);
  expect(foreign.body.errors?.[0]?.message).toEqual(unknown.body.errors?.[0]?.message);
  expect(foreign.body.errors?.[0]?.extensions?.code).toEqual(unknown.body.errors?.[0]?.extensions?.code);
});

it('today: delete removes the row for good and returns its id', async () => {
  const token = await registerUser(gql, 'delete@gmail.com');
  const created = await gql(APPLICATION, { input: { companyName: 'C', jobRole: 'R' } }, token);
  const id = created.body.data.createApplication.id;
  const res = await gql(DELETE, { id }, token);
  expect(res.body.errors).toBeUndefined();
  expect(res.body.data.deleteApplication.id).toBe(id);
  expect(await prisma.application.findUnique({ where: { id } })).toBeNull();
});

it('stats for a user with no applications', async () => {
  const token = await registerUser(gql, 'emptystats@gmail.com');
  const res = await gql(STATS, {}, token);
  expect(res.body.errors).toBeUndefined();
  expect(res.body.data.stats).toEqual({ total: 0, byStatus: [] });
});

it('stats follow a status change', async () => {
  const token = await registerUser(gql, 'statschange@gmail.com');
  const first = await gql(APPLICATION, { input: { companyName: 'C1', jobRole: 'R1' } }, token);
  await gql(APPLICATION, { input: { companyName: 'C2', jobRole: 'R2' } }, token);
  const before = await gql(STATS, {}, token);
  expect(before.body.data.stats.total).toBe(2);
  expect(counts(before)).toEqual({ APPLIED: 2 });

  await gql(UPDATE_APPLICATION, {
    input: { id: first.body.data.createApplication.id, status: 'INTERVIEW' },
  }, token);
  const after = await gql(STATS, {}, token);
  expect(after.body.data.stats.total).toBe(2);
  expect(counts(after)).toEqual({ APPLIED: 1, INTERVIEW: 1 });
});

it('an invalid status filter is refused by GraphQL before the resolver', async () => {
  const token = await registerUser(gql, 'badenum@gmail.com');
  const inline = await gql(`query { applications(status: NOPE) { id } }`, {}, token);
  expect(inline.body.errors).toBeDefined();
  expect(inline.body.data).toBeUndefined();
  expect(inline.body.errors[0].extensions.code).toBe('GRAPHQL_VALIDATION_FAILED');

  const viaVariable = await gql(
    `query ($status: Status) { applications(status: $status) { id } }`,
    { status: 'NOPE' },
    token,
  );
  expect(viaVariable.body.errors).toBeDefined();
  expect(viaVariable.body.errors[0].extensions.code).toBe('BAD_USER_INPUT');
  
});


});

