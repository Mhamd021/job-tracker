import { PrismaService } from '../src/prisma/prisma.service';
import { ApplicationsService } from '../src/applications/applications.service';
import { assertTestDatabase } from './assert-test-database';
import { resetTestDatabase } from './reset-test-database';







const uid = (v: unknown) => v as string;

const calls: [string, (s: ApplicationsService, bad: unknown, id: string) => Promise<unknown>][] = [
  ['findAll', (s, bad) => s.findAll(uid(bad))],
  ['findOne', (s, bad, id) => s.findOne(id, uid(bad))],
  ['create',  (s, bad) => s.create(uid(bad), { companyName: 'x', jobRole: 'y' })],
  ['update',  (s, bad, id) => s.update(uid(bad), { id, companyName: 'hacked' })],
  ['delete',  (s, bad, id) => s.delete(id, uid(bad))],
  ['stats',   (s, bad) => s.stats(uid(bad))],
];


describe('ApplicationsService without a user id', () => {
  let prisma: PrismaService;
  let service: ApplicationsService;

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.onModuleInit();
    await assertTestDatabase(prisma);
    service = new ApplicationsService(prisma);
  });

  beforeEach(async () => { await resetTestDatabase(prisma); });
  afterAll(async () => { await prisma.onModuleDestroy(); });

describe.each([['undefined', undefined], ['empty string', '']])('with a %s userId', (_label, bad) => {
  it.each(calls)('%s is refused and changes nothing', async (_name, call) => {
    const owner = await prisma.user.create({ data: { email: 'owner@example.com', password: 'x' } });
    const row = await prisma.application.create({
      data: { userId: owner.id, companyName: 'Original', jobRole: 'Role' },
    });
    await expect(call(service, bad, row.id)).rejects.toMatchObject({ status: 401 });
    const after = await prisma.application.findUniqueOrThrow({ where: { id: row.id } });
    expect(after.companyName).toBe('Original');
    expect(await prisma.application.count()).toBe(1);
  });
});

it('control: every method works with a real user id', async () => {
  const owner = await prisma.user.create({
    data: { email: 'control@example.com', password: 'x' },
  });
  const row = await prisma.application.create({
    data: { userId: owner.id, companyName: 'Original', jobRole: 'Role' },
  });
  const all = await service.findAll(owner.id);
    expect(all.length).toEqual(1);
  expect(all[0].id).toEqual(row.id);
  expect(await service.findOne(row.id,owner.id)).toEqual(row);
  const create = await service.create(owner.id,{companyName: 'New', jobRole: 'R'});
  expect(create.userId).toEqual(owner.id);

  await service.update(owner.id,{id:row.id,companyName: 'Changed' });
  const updated = await prisma.application.findFirstOrThrow({where:{id:row.id}});
  expect(updated.companyName).toEqual('Changed')
  const stats = await service.stats(owner.id);
  expect(stats.total).toEqual(2);
  await service.delete(row.id, owner.id);
   expect(await prisma.application.count({where:{id:row.id}})).toBe(0); 
});

});

