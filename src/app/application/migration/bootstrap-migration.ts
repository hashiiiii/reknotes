import type { IHookSource } from "../port/hook-source";
import type { IMigrationDatabase } from "../port/migration-database";
import type { ISchemaSync } from "../port/schema-sync";
import { ok, type Result } from "./result";

export type BootstrapMigrationDeps = {
  db: IMigrationDatabase;
  schema: ISchemaSync;
  hooks: IHookSource;
};

export async function bootstrapMigration(deps: BootstrapMigrationDeps): Promise<Result> {
  await deps.db.ensureDatabaseExists();
  await deps.schema.push();
  await deps.db.ensureHooksAppliedTable();
  const allHooks = deps.hooks.list();
  await deps.db.markHooksAsApplied(allHooks);
  return ok(`bootstrapped: marked ${allHooks.length} hook(s)`);
}
