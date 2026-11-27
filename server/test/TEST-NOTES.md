# Test notes: job tracker server

Started 2026-11-10, last updated 2026-11-13. Results come from my own local
runs. I write the prediction first, then run the mutation, then record what
happened. A test only counts once I have seen it red and green.

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
- The ownership tests register users through GraphQL and read the database
  directly to check what changed, so a bug in the read path cannot hide a bug in
  the write path.
- Check before and after risky work: the dev database still has 31 applications.
- A backup of the dev database exists (`backups/`, ignored by git) and a
  restore into a scratch database gave 31 applications.

## Status

| Suite | Tests | What it proves |
| --- | --- | --- |
| test-database.guard.spec.ts | 9 | the URL guard accepts only a loopback host and the test database name |
| assert-test-database.spec.ts | 3 | the runtime check fails closed, including an empty result |
| app.smoke.spec.ts | 2 | the real app boots against the test database and answers `health` |
| app-disconnect.spec.ts | 1 | no connection to the test database remains after `app.close()` |
| reset-test-database.spec.ts | 2 | with fakes: refuses on the wrong database, and truncates nothing there |
| reset-test-database.integration.spec.ts | 1 | with the real test database: both tables are empty after the reset |
| ownership.integration.spec.ts | 6 | a user cannot read, list, count, update, delete or re-own another user's applications |

Last full run: (run `npm run test:db` and write the numbers here). Before the
ownership suite it was 6 suites, 18 tests, all passing.

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
| 9 | `findOne`: `userId` removed from the `where` | B receives A's application | `toBeNull()` failed: B received A's `id` and `userId` | the owner filter is what protects single reads |
| 10 | `findOne`: `findFirst` replaced by `findFirstOrThrow` | the `errors` assertion goes red, `toBeNull` still passes | test went red; which assertion: (fill in) | a nullable GraphQL field turns an error into `null` plus `errors`, so assert on `errors` too |
| 11 | `findAll`: `userId` removed from the `where` | A's list contains B's row | A's list had length 3 instead of 2 | compare the whole set of ids, not only that A's ids are included |
| 12 | `stats`: `where: { userId }` removed | A's total includes B's row | `total` was 4 instead of 3 | |
| 13 | `stats`: `count: 1` instead of the real count | `counts` fails, `total` passes | `APPLIED: 1` instead of 2; `total` passed | `total` and `counts` are built by different lines and fail independently. B's data (one row) could not catch it |
| 14 | `update`: `userId` removed from the `where` | B's update succeeds | the `errors` assertion failed (received `undefined`) | |
| 15 | `delete`: `userId` removed from the `where` | B's delete succeeds | the `errors` assertion failed because the delete worked | the direct database reads after B's attempt: (fill in whether added) |
| 16 | `userId` test: first version sent a token string, then the token owner's own id (variable names swapped) | | the test could not fail either way | the smuggled id must belong to the other user |
| 17 | `create`: `{ ...input, userId }` swapped to `{ userId, ...input }`, with a temporary `userId` field on `CreateApplicationInput` | the row belongs to B and the "equals A" assertion fails | (fill in) | the order of the spread decides who owns the row |

Decision on `CASCADE`: keep it, so a future table that references these two is
emptied too. The name check runs first, so it cannot reach the dev data.
(Change this line if I decide differently.)

## Behaviour today (characterization, to be changed later)

- Updating or deleting a foreign or missing id returns `data: null` and a raw
  Prisma `P2025` message that includes my file path and a code snippet. Both
  cases look identical from outside, which is good. The message is not.
- Apollo returns stack traces in error responses.
- `status: null` on create fails inside Prisma with a misleading message
  ("Argument `user` is missing").
- The input type refuses an unknown `userId` field, and TypeScript refuses it
  in the test helper too. Three layers: TypeScript, the GraphQL schema, and the
  spread order in `create`.
- The list is ordered by `updatedAt` descending. The tests compare sorted ids,
  so the order itself is not tested yet.
- The stats test relies on the default status being APPLIED.

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
- A query uses type names from the schema (`ID!`, `CreateApplicationInput!`) and
  never `[`, `]` or `!` in the selection set. A variable must be declared with
  the exact type of the argument it feeds.
- I passed the token inside the variables once. Apollo ignored it silently, and
  the guard answered UNAUTHENTICATED. The token goes in the header.
- A helper that returns only `data` throws away `errors`. Return the response
  and put the assertions in the test.
- `toBeNull()` on a nullable field cannot tell "not found" from "crashed". Check
  that `errors` is undefined as well.
- Include checks miss leaks. Compare the exact, sorted set of ids.
- After an update or delete attempt, read the row directly from the database.
- I swapped the variable names of two users and wrote a test that could not
  fail. Check the labels before suspecting the code.
- Never print tokens in test logs.

## Not verified

- The loopback-host check in the URL guard: prediction only, never mutated.
- The mutation that duplicates the `$executeRawUnsafe` call: not recorded yet.
- Whether Prisma's `onModuleDestroy` also needs to run on process signals
  (`enableShutdownHooks`): not checked.
- Rows marked "(fill in)" above.

## Test backlog

Order matters

### 1. Ownership (most important)
- [x] user A cannot read user B's application by id (`application` returns null)
- [x] B's application is not in A's `applications` list or in A's `stats`
- [x] A cannot update B's application, and B's row is unchanged
- [x] A cannot delete B's application, and B's row still exists
- [x] `userId` cannot be set through the input (mutation 17 result: fill in)

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
- [ ] `stats` for a user with no applications

### 4. Validation (red tests first, then the code)
- [ ] empty or whitespace names, too long strings, invalid URL, `status: null`

### 5. Error contract
- [ ] a missing id and a foreign id give the same response
- [ ] no stack trace in the response outside development
- [ ] stable `extensions.code` values
