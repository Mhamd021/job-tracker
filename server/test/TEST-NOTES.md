# Test notes: job tracker server

Started 2026-11-10. Results come from my own local runs. I write the prediction
first, then run the mutation, then record what happened.

## How to run

```powershell
npm run test:db                          # all database-backed specs
npm run test:db -- <part of file name>   # one spec
```

- Config: `test/jest-db.json` (only files `test/**/*.spec.ts`, run in band).
- The tests use their own container `job_tracker_test_db` on host port 5433 and
  the database `job_tracker_test`. The dev database `job_tracker` (container
  `job_tracker_db`, port 5432) holds my real applications and is never used.
- `test/setup.env.ts` sets `DATABASE_URL` from `TEST_DATABASE_URL` before the
  app is imported. `TEST_DATABASE_URL` never falls back to `DATABASE_URL`.
- Every database test calls `assertTestDatabase(prisma)` first. It throws unless
  `current_database()` is `job_tracker_test`.
- Check before and after risky work: the dev database still has 31 applications.

## Status

| Suite | Tests | What it proves |
| --- | --- | --- |
| test-database.guard.spec.ts | 9 | the URL guard accepts only a loopback host and the test database name |
| assert-test-database.spec.ts | 3 | the runtime check fails closed, including an empty result |
| app.smoke.spec.ts | 2 | the real app boots against the test database and answers `health` |
| app-disconnect.spec.ts | 1 | no connection to the test database remains after `app.close()` |
| reset-test-database.spec.ts | 2 | with fakes: refuses on the wrong database, and truncates nothing there |
| reset-test-database.integration.spec.ts | 1 | with the real test database: both tables are empty after the reset |

Last full run: 6 suites, 18 tests, all passing.

## Mutation record

| # | What I changed | Prediction | What happened | Lesson |
| --- | --- | --- | --- | --- |
| 1 | `assertTestDatabase`: removed the `throw` | tests 2 and 3 go red | tests 2 and 3 red, test 1 stayed green | a test that expects a rejection is the one that catches it |
| 2 | `setup.env.ts`: override line commented out (by accident) | the app connects to the dev database | smoke test received `job_tracker` instead of `job_tracker_test`; restored, it received `job_tracker_test` | the override line is what protects the dev data. Only a `SELECT` ran |
| 3 | `PrismaService`: pool not ended on shutdown (before and after) | one connection stays open | before: 1 idle connection after `app.close()`; after `pool.end()`: 0 and the "did not exit" warning was gone | `$disconnect()` did not close the pool I created. `--detectOpenHandles` did not report it |
| 4 | reset helper: safety check moved below the `TRUNCATE` | the refusal test fails | `not.toHaveBeenCalled()` failed (1 call with the TRUNCATE), while `rejects.toThrow` still passed | assert that the dangerous action did not happen, not only that an error appeared |
| 5 | integration: `"User"` removed from the TRUNCATE list | user count assertion fails | user count failed | |
| 6 | integration: `"Application"` removed from the list, with `CASCADE` | (fill in) | **survived**: still green | `TRUNCATE "User" CASCADE` also empties tables that reference it |
| 7 | integration: both tables, no `CASCADE` | (fill in) | **survived**: still green | Postgres accepts it when all related tables are named in one command |
| 8 | integration: only `"User"`, no `CASCADE` | (fill in) | error from inside the helper, code `0A000`, "cannot truncate a table referenced in a foreign key constraint" | the error comes from the database, not from an `expect` |

Decision on `CASCADE`: keep it, so a future table that references these two is
emptied too. The name check runs first, so it cannot reach the dev data.
(Change this line if I decide differently.)

## Mistakes worth remembering

- A leftover row from a failed mutation run caused a unique-email error on the
  next run. A test must not depend on earlier runs: delete rows in `beforeEach`
  (applications first, then users) and use a unique email per run.
- The `beforeEach` order only matters when rows already exist. On an empty
  database both orders pass, so the green result proved nothing about it.
- I once edited the expected string in the test instead of the production code.
  That only shows the matcher works. Mutate the code under test.
- A test with no `expect` cannot fail. Run each new test red at least once.
- `$queryRaw` returns an array of rows. Type it, then read `rows[0].column`.

## Not verified

- The loopback-host check in the URL guard: prediction only, never mutated.
- The mutation that duplicates the `$executeRawUnsafe` call: not recorded yet.
- Whether Prisma's `onModuleDestroy` also needs to run on process signals
  (`enableShutdownHooks`): not checked.

## Test backlog

Order matters. Characterization first: record what the app does today, bugs
included, before I change anything.

### 1. Ownership (most important)
- [ ] user A cannot read user B's application by id (`application` returns null)
- [ ] B's application is not in A's `applications` list or in A's `stats`
- [ ] A cannot update B's application, and B's row is unchanged
- [ ] A cannot delete B's application, and B's row still exists
- [ ] `userId` cannot be set through the input

### 2. Authentication
- [ ] every query and mutation without a token returns UNAUTHENTICATED
- [ ] tampered token, token signed with another secret, expired token: rejected
- [ ] wrong scheme (`Basic <token>`): record what happens today
- [ ] register: duplicate email, email case, empty password (today: accepted?)
- [ ] login: wrong password and unknown email give the same message

### 3. Applications behaviour
- [ ] create: default status APPLIED, `userId` comes from the token
- [ ] filter by status, newest `updatedAt` first
- [ ] update: omitted field unchanged, `updatedAt` changes
- [ ] `null` on a required field: record today's behaviour (Prisma error)
- [ ] delete: current hard delete, then the new behaviour after the decision
- [ ] `stats`: counts per status are right and isolated per user

### 4. Validation (red tests first, then the code)
- [ ] empty or whitespace names, too long strings, invalid URL, `status: null`

### 5. Error contract
- [ ] a missing id and a foreign id give the same response
- [ ] no stack trace in the response outside development
- [ ] stable `extensions.code` values

### 6. Later
- [ ] one test group per new feature, with a mutation for each guard