import { findDestructive } from "../../domain/migration/destructive";
import type { HookFile } from "../../domain/migration/hook";
import type { IHookProvider } from "../port/hook-provider";
import type { IMigrationProvider } from "../port/migration-provider";
import type { ISchemaSyncProvider } from "../port/schema-sync-provider";
import { err, ok, type Result } from "./result";

export type ApplyMigrationDeps = {
  db: IMigrationProvider;
  schema: ISchemaSyncProvider;
  hooks: IHookProvider;
};

export async function applyMigration(deps: ApplyMigrationDeps): Promise<Result> {
  await deps.db.ensureDatabaseExists();
  await deps.db.ensureHooksAppliedTable();

  const diff = await deps.schema.generateDiff();
  if (diff.error !== null) return err(diff.error);
  if (diff.sql !== "") {
    const destructive = findDestructive(diff.sql);
    if (destructive.length > 0) return err(`destructive: ${destructive.join(" | ")}`);
  }

  const allHooks = deps.hooks.list();
  const applied = await deps.db.loadAppliedHooks();
  const appliedMap = new Map(applied.map((h) => [h.filename, h.checksum]));

  for (const h of allHooks) {
    const prior = appliedMap.get(h.filename);
    if (prior !== undefined && prior !== h.checksum) {
      return err(`edited-hook: ${h.filename} (prior=${prior.slice(0, 8)}, current=${h.checksum.slice(0, 8)})`);
    }
  }

  const pendingPre = filterPending(allHooks, appliedMap, "pre");
  await deps.db.applyHooks(pendingPre);

  await deps.schema.push();

  const pendingPost = filterPending(allHooks, appliedMap, "post");
  await deps.db.applyHooks(pendingPost);

  return ok(`applied: pre=${pendingPre.length}, post=${pendingPost.length}`);
}

function filterPending(hooks: HookFile[], appliedMap: Map<string, string>, kind: "pre" | "post"): HookFile[] {
  return hooks.filter((h) => h.kind === kind && !appliedMap.has(h.filename));
}
