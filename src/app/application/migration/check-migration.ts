import { findDestructive } from "../../domain/migration/destructive";
import type { IMigrationDatabase } from "../port/migration-database";
import type { ISchemaSync } from "../port/schema-sync";

export type CheckResult =
  | { kind: "skipped"; reason: string }
  | { kind: "no-changes" }
  | { kind: "safe" }
  | { kind: "destructive"; statements: string[] }
  | { kind: "error"; message: string };

export type CheckMigrationDeps = {
  db: IMigrationDatabase;
  schema: ISchemaSync;
};

export async function checkMigration(deps: CheckMigrationDeps): Promise<CheckResult> {
  if (!(await deps.db.probe())) {
    return { kind: "skipped", reason: "DB unreachable" };
  }
  const diff = await deps.schema.generateDiff();
  if (diff.error !== null) return { kind: "error", message: diff.error };
  if (diff.sql === "") return { kind: "no-changes" };
  const destructive = findDestructive(diff.sql);
  if (destructive.length > 0) return { kind: "destructive", statements: destructive };
  return { kind: "safe" };
}
