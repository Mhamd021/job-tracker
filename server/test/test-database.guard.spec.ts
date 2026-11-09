import { getTestDatabaseUrl } from './test-database.guard';

describe('getTestDatabaseUrl', () => {
  const safeUrl =
    'postgresql://postgres:password@127.0.0.1:5433/job_tracker_test';

  it('returns an explicitly configured local test database URL', () => {
    expect(getTestDatabaseUrl({ TEST_DATABASE_URL: safeUrl })).toBe(safeUrl);
  });

  it.each([
    'postgresql://postgres:password@localhost:5433/job_tracker_test',
    'postgresql://postgres:password@127.0.0.1:5433/job_tracker_test',
    'postgresql://postgres:password@[::1]:5433/job_tracker_test',
  ])('accepts a loopback URL: %s', (url) => {
    expect(getTestDatabaseUrl({ TEST_DATABASE_URL: url })).toBe(url);
  });

  it('refuses a missing test URL even when DATABASE_URL is present', () => {
    expect(() =>
      getTestDatabaseUrl({
        DATABASE_URL:
          'postgresql://postgres:password@localhost:5432/job_tracker',
      }),
    ).toThrow(/TEST_DATABASE_URL is required/);
  });

  it.each([
    ['not a URL', 'not-a-url', /must be a valid PostgreSQL URL/],
    [
      'wrong protocol',
      'https://localhost/job_tracker_test',
      /must use the PostgreSQL protocol/,
    ],
    [
      'non-loopback host',
      'postgresql://postgres:password@db:5433/job_tracker_test',
      /local loopback host/,
    ],
    [
      'the dev database name',
      'postgresql://postgres:password@localhost:5432/job_tracker',
      /must target the job_tracker_test database/,
    ],
  ])('refuses an unsafe URL: %s', (_label, url, message) => {
    expect(() => getTestDatabaseUrl({ TEST_DATABASE_URL: url })).toThrow(
      message,
    );
  });
});