import 'dotenv/config';
import { getTestDatabaseUrl } from './test-database.guard';

process.env.DATABASE_URL = getTestDatabaseUrl();
process.env.JWT_SECRET = 'test-only-secret-for-integration-tests';