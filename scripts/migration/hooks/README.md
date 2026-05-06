# Migration hooks

SQL hooks that run around `drizzle-kit push` as part of `bun run migrate`. Use them when a schema change needs data adjustment before or after the schema is synced (e.g., fill `NULL`s before adding `NOT NULL`, backfill a new column, deduplicate before adding `UNIQUE`).

## Naming

```
YYYYMMDD-<description>.pre.sql
YYYYMMDD-<description>.post.sql
```

- `YYYYMMDD` makes lexicographic order equal chronological order.
- `.pre.sql` runs **before** `drizzle-kit push`.
- `.post.sql` runs **after** `drizzle-kit push`.
- Pre and post for the same deploy should share the prefix: `20260501-rename-body.pre.sql` + `20260501-rename-body.post.sql`.

## Rules

- **Add only.** Never edit or delete an existing file.
- Once a hook has been applied, it is recorded in `_hooks_applied` with its SHA-256 checksum. If the file's content later changes, the next `migrate` fails with a checksum-mismatch error.
- To correct a past hook, add a **new** file with a later date.
- Each hook is run exactly once per database. Subsequent runs skip files already in `_hooks_applied`.

## Idempotency

All hooks (pre and post) must be idempotent: re-running a hook on the same database must produce the same end state as the first run. The same rule applies to manual destructive SQL.

`_hooks_applied` skips files already applied, so the normal path runs each hook exactly once. Idempotency covers cases the run-once mechanism cannot:

- A pre or post batch wraps every hook in a single transaction. If any hook in the batch fails, all hook bodies AND their `_hooks_applied` rows roll back, and the retry re-runs every hook.
- Manual destructive SQL (see below) is outside the run-once mechanism entirely, so the operator may re-run the same statement.

How to write idempotent SQL:

- DDL: `CREATE TABLE IF NOT EXISTS`, `DROP TABLE IF EXISTS`, `CREATE INDEX IF NOT EXISTS`.
- Inserts: `INSERT … ON CONFLICT DO NOTHING` (or `DO UPDATE`).
- Updates: guard with `WHERE` so a second run is a no-op (`UPDATE foo SET bar = 'default' WHERE bar IS NULL`).
- Avoid deltas (`counter = counter + 1`); prefer absolute assignments.

`drizzle-kit push` is idempotent by construction (it diffs `schema.ts` against the live DB and applies only the difference).

## Destructive changes are not automated

`DROP TABLE`, `DROP COLUMN`, and `SET DATA TYPE` are **rejected by the runner** — the deploy fails so no data is lost silently. Column renames are also rejected (drizzle-kit requires an interactive TTY to resolve rename ambiguity).

Handle these manually:

1. Run the destructive SQL yourself against the database (e.g., `psql` on Neon).
2. Commit the matching `schema.ts` change so the next `drizzle-kit push` sees no diff.

Place hook files in this directory (`scripts/migration/hooks/`).

## Bootstrap

On a fresh database, run `bun run migrate -- --bootstrap` once. It runs `drizzle-kit push` to create all tables (including `_hooks_applied`) and then records every existing hook file as applied **without executing the SQL**. Future hooks are added on top as usual.
