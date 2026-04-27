import type { IHookProvider } from "../port/hook-provider";
import type { IMigrationProvider } from "../port/migration-provider";
import type { ISchemaSyncProvider } from "../port/schema-sync-provider";
import { ok, type Result } from "./result";

export type BootstrapMigrationDeps = {
  db: IMigrationProvider;
  schema: ISchemaSyncProvider;
  hooks: IHookProvider;
};

export async function bootstrapMigration(deps: BootstrapMigrationDeps): Promise<Result> {
  await deps.db.ensureDatabaseExists();
  await deps.schema.push();
  await deps.db.ensureHooksAppliedTable();
  const allHooks = deps.hooks.list();
  await deps.db.markHooksAsApplied(allHooks);
  return ok(`bootstrapped: marked ${allHooks.length} hook(s)`);
}
