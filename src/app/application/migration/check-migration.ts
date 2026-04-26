import { findDestructive } from "../../domain/migration/destructive";
import type { IMigrationDatabase } from "../port/migration-database";
import type { ISchemaSync } from "../port/schema-sync";
import { err, ok, type Result } from "./result";

export type CheckMigrationDeps = {
  db: IMigrationDatabase;
  schema: ISchemaSync;
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
