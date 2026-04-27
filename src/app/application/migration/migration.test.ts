import { describe, expect, test } from "bun:test";
import type { AppliedHook, HookFile } from "../../domain/migration/hook";
import type { IHookProvider } from "../port/hook-provider";
import type { IMigrationProvider } from "../port/migration-provider";
import type { DiffResult, ISchemaSyncProvider } from "../port/schema-sync-provider";
import { applyMigration } from "./apply-migration";
import { bootstrapMigration } from "./bootstrap-migration";
import { checkMigration } from "./check-migration";

class FakeDatabase implements IMigrationProvider {
  reachable = true;
  applied: AppliedHook[] = [];
  applyHooksCalls: HookFile[][] = [];
  markCalls: HookFile[][] = [];
  ensureCalled = 0;
  ensureDbCalled = 0;

  async ensureDatabaseExists(): Promise<void> {
    this.ensureDbCalled++;
  }
  async probe(): Promise<boolean> {
    return this.reachable;
  }
  async ensureHooksAppliedTable(): Promise<void> {
    this.ensureCalled++;
  }
  async loadAppliedHooks(): Promise<AppliedHook[]> {
    return this.applied;
  }
  async applyHooks(hooks: HookFile[]): Promise<void> {
    this.applyHooksCalls.push(hooks);
    for (const h of hooks) this.applied.push({ filename: h.filename, checksum: h.checksum });
  }
  async markHooksAsApplied(hooks: HookFile[]): Promise<void> {
    this.markCalls.push(hooks);
    for (const h of hooks) this.applied.push({ filename: h.filename, checksum: h.checksum });
  }

  flatAppliedFilenames(): string[] {
    return this.applyHooksCalls.flatMap((batch) => batch.map((h) => h.filename));
  }
}

class FakeSchema implements ISchemaSyncProvider {
  diff: DiffResult = { sql: "", error: null };
  pushCalls = 0;

  async generateDiff(): Promise<DiffResult> {
    return this.diff;
  }
  async push(): Promise<void> {
    this.pushCalls++;
  }
}

class FakeHooks implements IHookProvider {
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
  test("ok skipped when DB unreachable", async () => {
    const db = new FakeDatabase();
    db.reachable = false;
    const result = await checkMigration({ db, schema: new FakeSchema() });
    expect(result.kind).toBe("ok");
    expect(result.message).toContain("skipped");
  });

  test("error propagates from schema sync", async () => {
    const schema = new FakeSchema();
    schema.diff = { sql: null, error: "drizzle-kit generate failed" };
    const result = await checkMigration({ db: new FakeDatabase(), schema });
    expect(result).toEqual({ kind: "error", message: "drizzle-kit generate failed" });
  });

  test("ok no-changes when diff sql is empty", async () => {
    const result = await checkMigration({ db: new FakeDatabase(), schema: new FakeSchema() });
    expect(result.kind).toBe("ok");
    expect(result.message).toBe("no-changes");
  });

  test("error when DROP COLUMN present", async () => {
    const schema = new FakeSchema();
    schema.diff = { sql: `ALTER TABLE "notes" DROP COLUMN "foo";`, error: null };
    const result = await checkMigration({ db: new FakeDatabase(), schema });
    expect(result.kind).toBe("error");
    expect(result.message).toContain("destructive");
    expect(result.message).toContain("DROP COLUMN");
  });

  test("ok safe when only ADD COLUMN", async () => {
    const schema = new FakeSchema();
    schema.diff = { sql: `ALTER TABLE "notes" ADD COLUMN "foo" text;`, error: null };
    const result = await checkMigration({ db: new FakeDatabase(), schema });
    expect(result).toEqual({ kind: "ok", message: "safe" });
  });
});

describe("applyMigration", () => {
  test("error with destructive when DROP COLUMN in diff", async () => {
    const schema = new FakeSchema();
    schema.diff = { sql: `ALTER TABLE "notes" DROP COLUMN "foo";`, error: null };
    const result = await applyMigration({ db: new FakeDatabase(), schema, hooks: new FakeHooks() });
    expect(result.kind).toBe("error");
    expect(result.message).toContain("destructive");
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
    db.applied = [{ filename: "20260101-a.pre.sql", checksum: "ORIGINALCHECKSUM" }];
    const hooks = new FakeHooks();
    hooks.hooks = [hook("20260101-a.pre.sql", "edited", "EDITEDCHECKSUM")];
    const result = await applyMigration({ db, schema: new FakeSchema(), hooks });
    expect(result.kind).toBe("error");
    expect(result.message).toContain("edited-hook");
    expect(result.message).toContain("20260101-a.pre.sql");
  });

  test("ok applied: applies pending pre-hooks, then push, then post-hooks", async () => {
    const db = new FakeDatabase();
    const schema = new FakeSchema();
    const hooks = new FakeHooks();
    hooks.hooks = [hook("20260101-a.pre.sql"), hook("20260101-a.post.sql"), hook("20260201-b.pre.sql")];
    const result = await applyMigration({ db, schema, hooks });
    expect(result).toEqual({ kind: "ok", message: "applied: pre=2, post=1" });
    expect(db.applyHooksCalls).toHaveLength(2);
    expect(db.flatAppliedFilenames()).toEqual(["20260101-a.pre.sql", "20260201-b.pre.sql", "20260101-a.post.sql"]);
    expect(schema.pushCalls).toBe(1);
    expect(db.ensureCalled).toBe(1);
    expect(db.ensureDbCalled).toBe(1);
  });

  test("skips hooks already in _hooks_applied", async () => {
    const db = new FakeDatabase();
    db.applied = [{ filename: "20260101-a.pre.sql", checksum: "cs-20260101-a.pre.sql" }];
    const hooks = new FakeHooks();
    hooks.hooks = [hook("20260101-a.pre.sql"), hook("20260201-b.pre.sql")];
    const result = await applyMigration({ db, schema: new FakeSchema(), hooks });
    expect(result).toEqual({ kind: "ok", message: "applied: pre=1, post=0" });
    expect(db.flatAppliedFilenames()).toEqual(["20260201-b.pre.sql"]);
  });
});

describe("bootstrapMigration", () => {
  test("ok: pushes schema then marks all hooks as applied without executing", async () => {
    const db = new FakeDatabase();
    const schema = new FakeSchema();
    const hooks = new FakeHooks();
    hooks.hooks = [hook("20260101-a.pre.sql"), hook("20260101-a.post.sql")];
    const result = await bootstrapMigration({ db, schema, hooks });
    expect(result).toEqual({ kind: "ok", message: "bootstrapped: marked 2 hook(s)" });
    expect(schema.pushCalls).toBe(1);
    expect(db.markCalls).toHaveLength(1);
    expect(db.markCalls[0]).toHaveLength(2);
    expect(db.applyHooksCalls).toHaveLength(0);
    expect(db.ensureDbCalled).toBe(1);
  });

  test("ok with zero hooks", async () => {
    const db = new FakeDatabase();
    const schema = new FakeSchema();
    const result = await bootstrapMigration({ db, schema, hooks: new FakeHooks() });
    expect(result).toEqual({ kind: "ok", message: "bootstrapped: marked 0 hook(s)" });
    expect(schema.pushCalls).toBe(1);
  });
});
