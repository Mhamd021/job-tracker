import { PrismaService } from "../src/prisma/prisma.service";
import { assertTestDatabase } from "./assert-test-database";

export async function resetTestDatabase(prisma: PrismaService): Promise<void> {
   await assertTestDatabase(prisma);
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "Application", "User" CASCADE;`);

     
}