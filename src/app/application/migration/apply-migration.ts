import { findDestructive } from "../../domain/migration/destructive";
import type { HookFile } from "../../domain/migration/hook";
import type { IHookSource } from "../port/hook-source";
import type { IMigrationDatabase } from "../port/migration-database";
import type { ISchemaSync } from "../port/schema-sync";

export type EditedHook = { filename: string; priorChecksum: string; currentChecksum: string };

export type ApplyResult =
  | { kind: "destructive"; statements: string[] }
  | { kind: "edited-hook"; edited: EditedHook }
  | { kind: "error"; message: string }
  | { kind: "applied"; preCount: number; postCount: number };

export type ApplyMigrationDeps = {
  db: IMigrationDatabase;
  schema: ISchemaSync;
  hooks: IHookSource;
};

export async function applyMigration(deps: ApplyMigrationDeps): Promise<ApplyResult> {
  await deps.db.ensureHooksAppliedTable();

  const diff = await deps.schema.generateDiff();
  if (diff.error !== null) return { kind: "error", message: diff.error };
  if (diff.sql !== "") {
    const destructive = findDestructive(diff.sql);
    if (destructive.length > 0) return { kind: "destructive", statements: destructive };
  }

  const allHooks = deps.hooks.list();
  const applied = await deps.db.loadAppliedHooks();
  const appliedMap = new Map(applied.map((h) => [h.filename, h.checksum]));

  for (const h of allHooks) {
    const prior = appliedMap.get(h.filename);
    if (prior !== undefined && prior !== h.checksum) {
      return {
        kind: "edited-hook",
        edited: { filename: h.filename, priorChecksum: prior, currentChecksum: h.checksum },
      };
    }
  }

  const pendingPre = filterPending(allHooks, appliedMap, "pre");
  await deps.db.applyHooks(pendingPre);

  await deps.schema.push();

  const pendingPost = filterPending(allHooks, appliedMap, "post");
  await deps.db.applyHooks(pendingPost);

  return { kind: "applied", preCount: pendingPre.length, postCount: pendingPost.length };
}

function filterPending(hooks: HookFile[], appliedMap: Map<string, string>, kind: "pre" | "post"): HookFile[] {
  return hooks.filter((h) => h.kind === kind && !appliedMap.has(h.filename));
}
