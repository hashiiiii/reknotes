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

## Destructive changes are not automated

`DROP TABLE`, `DROP COLUMN`, and `SET DATA TYPE` are **rejected by the runner** — the deploy fails so no data is lost silently. Column renames are also rejected (drizzle-kit requires an interactive TTY to resolve rename ambiguity).

Handle these manually:

1. Run the destructive SQL yourself against the database (e.g., `psql` on Neon).
2. Commit the matching `schema.ts` change so the next `drizzle-kit push` sees no diff.

## Bootstrap

On a fresh database, run `bun run migrate -- --bootstrap` once. It runs `drizzle-kit push` to create all tables (including `_hooks_applied`) and then records every existing hook file as applied **without executing the SQL**. Future hooks are added on top as usual.
