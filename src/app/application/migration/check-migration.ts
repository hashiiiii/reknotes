import { findDestructive } from "../../domain/migration/destructive";
import type { IMigrationProvider } from "../port/migration-provider";
import type { ISchemaSyncProvider } from "../port/schema-sync-provider";
import { err, ok, type Result } from "./_result";

export type CheckMigrationDeps = {
  db: IMigrationProvider;
  schema: ISchemaSyncProvider;
};

export async function checkMigration(deps: CheckMigrationDeps): Promise<Result> {
  if (!(await deps.db.probe())) return ok("skipped: DB unreachable");
  const diff = await deps.schema.generateDiff();
  if (diff.error !== null) return err(diff.error);
  if (diff.sql === "") return ok("no-changes");
  const destructive = findDestructive(diff.sql);
  if (destructive.length > 0) return err(`destructive: ${destructive.join(" | ")}`);
  return ok("safe");
}
