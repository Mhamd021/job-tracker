import { PrismaService } from "../src/prisma/prisma.service";
import { TEST_DATABASE_NAME } from "./test-database.guard";

export async function assertTestDatabase(prisma: PrismaService): Promise<void> {
   const result =  await prisma.$queryRaw<{ db: string }[]>`SELECT current_database() AS db;`;

    if(  result[0]?.db !== TEST_DATABASE_NAME) {
        throw new Error(`Expected test database to be ${TEST_DATABASE_NAME}, but found ${result[0]?.db ?? 'no rows returned'}  `);
    }
}