import { describe, expect, test } from "bun:test";
import type { AppliedHook, HookFile } from "../../domain/migration/hook";
import type { IHookSource } from "../port/hook-source";
import type { IMigrationDatabase } from "../port/migration-database";
import type { DiffResult, ISchemaSync } from "../port/schema-sync";
import { applyMigration } from "./apply-migration";
import { bootstrapMigration } from "./bootstrap-migration";
import { checkMigration } from "./check-migration";

class FakeDatabase implements IMigrationDatabase {
  reachable = true;
  applied: AppliedHook[] = [];
  appliedHookCalls: HookFile[] = [];
  markCalls: HookFile[][] = [];
  ensureCalled = 0;

  async probe(): Promise<boolean> {
    return this.reachable;
  }
  async createLocalIfMissing(): Promise<void> {}
  async ensureHooksAppliedTable(): Promise<void> {
    this.ensureCalled++;
  }
  async loadAppliedHooks(): Promise<AppliedHook[]> {
    return this.applied;
  }
  async applyHook(hook: HookFile): Promise<void> {
    this.appliedHookCalls.push(hook);
    this.applied.push({ filename: hook.filename, checksum: hook.checksum });
  }
  async markHooksAsApplied(hooks: HookFile[]): Promise<void> {
    this.markCalls.push(hooks);
    for (const h of hooks) this.applied.push({ filename: h.filename, checksum: h.checksum });
  }
}

class FakeSchema implements ISchemaSync {
  diff: DiffResult = { sql: "", error: null };
  pushCalls = 0;

  async generateDiff(): Promise<DiffResult> {
    return this.diff;
  }
  async push(): Promise<void> {
    this.pushCalls++;
  }
}

class FakeHooks implements IHookSource {
  hooks: HookFile[] = [];
  list(): HookFile[] {
    return this.hooks;
  }
}

function hook(filename: string, content = "SELECT 1;", checksum?: string): HookFile {
  return {
    filename,
    kind: filename.endsWith(".pre.sql") ? "pre" : "post",
    content,
    checksum: checksum ?? `cs-${filename}`,
  };
}

describe("checkMigration", () => {
  test("skipped when DB unreachable", async () => {
    const db = new FakeDatabase();
    db.reachable = false;
    const schema = new FakeSchema();
    const result = await checkMigration({ db, schema });
    expect(result).toEqual({ kind: "skipped", reason: "DB unreachable" });
  });

  test("error propagates from schema sync", async () => {
    const schema = new FakeSchema();
    schema.diff = { sql: null, error: "drizzle-kit generate failed" };
    const result = await checkMigration({ db: new FakeDatabase(), schema });
    expect(result).toEqual({ kind: "error", message: "drizzle-kit generate failed" });
  });

  test("no-changes when diff sql is empty", async () => {
    const result = await checkMigration({ db: new FakeDatabase(), schema: new FakeSchema() });
    expect(result).toEqual({ kind: "no-changes" });
  });

  test("destructive when DROP COLUMN present", async () => {
    const schema = new FakeSchema();
    schema.diff = { sql: `ALTER TABLE "notes" DROP COLUMN "foo";`, error: null };
    const result = await checkMigration({ db: new FakeDatabase(), schema });
    expect(result.kind).toBe("destructive");
    if (result.kind === "destructive") expect(result.statements).toHaveLength(1);
  });

  test("safe when only ADD COLUMN", async () => {
    const schema = new FakeSchema();
    schema.diff = { sql: `ALTER TABLE "notes" ADD COLUMN "foo" text;`, error: null };
    const result = await checkMigration({ db: new FakeDatabase(), schema });
    expect(result).toEqual({ kind: "safe" });
  });
});

describe("applyMigration", () => {
  test("aborts with destructive when DROP COLUMN in diff", async () => {
    const schema = new FakeSchema();
    schema.diff = { sql: `ALTER TABLE "notes" DROP COLUMN "foo";`, error: null };
    const result = await applyMigration({ db: new FakeDatabase(), schema, hooks: new FakeHooks() });
    expect(result.kind).toBe("destructive");
    expect(schema.pushCalls).toBe(0);
  });

  test("propagates schema-sync error", async () => {
    const schema = new FakeSchema();
    schema.diff = { sql: null, error: "drizzle-kit generate failed" };
    const result = await applyMigration({ db: new FakeDatabase(), schema, hooks: new FakeHooks() });
    expect(result).toEqual({ kind: "error", message: "drizzle-kit generate failed" });
  });

  test("detects edited hook (checksum mismatch)", async () => {
    const db = new FakeDatabase();
    db.applied = [{ filename: "20260101-a.pre.sql", checksum: "ORIGINAL" }];
    const hooks = new FakeHooks();
    hooks.hooks = [hook("20260101-a.pre.sql", "edited", "EDITED")];
    const result = await applyMigration({ db, schema: new FakeSchema(), hooks });
    expect(result.kind).toBe("edited-hook");
    if (result.kind === "edited-hook") {
      expect(result.edited).toEqual({
        filename: "20260101-a.pre.sql",
        priorChecksum: "ORIGINAL",
        currentChecksum: "EDITED",
      });
    }
  });

  test("applies pending pre-hooks, then push, then post-hooks", async () => {
    const db = new FakeDatabase();
    const schema = new FakeSchema();
    const hooks = new FakeHooks();
    hooks.hooks = [hook("20260101-a.pre.sql"), hook("20260101-a.post.sql"), hook("20260201-b.pre.sql")];
    const result = await applyMigration({ db, schema, hooks });
    expect(result).toEqual({ kind: "applied", preCount: 2, postCount: 1 });
    expect(db.appliedHookCalls.map((h) => h.filename)).toEqual([
      "20260101-a.pre.sql",
      "20260201-b.pre.sql",
      "20260101-a.post.sql",
    ]);
    expect(schema.pushCalls).toBe(1);
    expect(db.ensureCalled).toBe(1);
  });

  test("skips hooks already in _hooks_applied", async () => {
    const db = new FakeDatabase();
    db.applied = [{ filename: "20260101-a.pre.sql", checksum: "cs-20260101-a.pre.sql" }];
    const hooks = new FakeHooks();
    hooks.hooks = [hook("20260101-a.pre.sql"), hook("20260201-b.pre.sql")];
    const result = await applyMigration({ db, schema: new FakeSchema(), hooks });
    expect(result).toEqual({ kind: "applied", preCount: 1, postCount: 0 });
    expect(db.appliedHookCalls.map((h) => h.filename)).toEqual(["20260201-b.pre.sql"]);
  });
});

describe("bootstrapMigration", () => {
  test("pushes schema then marks all hooks as applied without executing", async () => {
    const db = new FakeDatabase();
    const schema = new FakeSchema();
    const hooks = new FakeHooks();
    hooks.hooks = [hook("20260101-a.pre.sql"), hook("20260101-a.post.sql")];
    const result = await bootstrapMigration({ db, schema, hooks });
    expect(result).toEqual({ kind: "bootstrapped", markedCount: 2 });
    expect(schema.pushCalls).toBe(1);
    expect(db.markCalls).toHaveLength(1);
    expect(db.markCalls[0]).toHaveLength(2);
    expect(db.appliedHookCalls).toHaveLength(0); // hook SQL は実行されない
  });

  test("succeeds with zero hooks", async () => {
    const db = new FakeDatabase();
    const schema = new FakeSchema();
    const result = await bootstrapMigration({ db, schema, hooks: new FakeHooks() });
    expect(result).toEqual({ kind: "bootstrapped", markedCount: 0 });
    expect(schema.pushCalls).toBe(1);
  });
});
