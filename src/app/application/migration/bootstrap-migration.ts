import type { IHookSource } from "../port/hook-source";
import type { IMigrationDatabase } from "../port/migration-database";
import type { ISchemaSync } from "../port/schema-sync";

export type BootstrapResult = { kind: "bootstrapped"; markedCount: number };

export type BootstrapMigrationDeps = {
  db: IMigrationDatabase;
  schema: ISchemaSync;
  hooks: IHookSource;
};

export async function bootstrapMigration(deps: BootstrapMigrationDeps): Promise<BootstrapResult> {
  await deps.schema.push();
  await deps.db.ensureHooksAppliedTable();
  const allHooks = deps.hooks.list();
  await deps.db.markHooksAsApplied(allHooks);
  return { kind: "bootstrapped", markedCount: allHooks.length };
}
