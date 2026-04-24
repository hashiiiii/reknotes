import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { computeChecksum, enumerateHooks, findDestructive } from "./migrate";

describe("findDestructive", () => {
  test("detects DROP TABLE", () => {
    const sql = `DROP TABLE "note_tags" CASCADE;`;
    expect(findDestructive(sql)).toHaveLength(1);
  });

  test("detects DROP COLUMN", () => {
    const sql = `ALTER TABLE "notes" DROP COLUMN "title";`;
    expect(findDestructive(sql)).toHaveLength(1);
  });

  test("detects SET DATA TYPE", () => {
    const sql = `ALTER TABLE "notes" ALTER COLUMN "created_at" SET DATA TYPE integer;`;
    expect(findDestructive(sql)).toHaveLength(1);
  });

  test("detects all 3 types in Scenario A output (real drizzle-kit fixture)", () => {
    const sql = `ALTER TABLE "note_tags" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "note_tags" CASCADE;--> statement-breakpoint
ALTER TABLE "notes" ALTER COLUMN "created_at" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "notes" ALTER COLUMN "updated_at" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "notes" DROP COLUMN "title";`;
    const results = findDestructive(sql);
    // DROP TABLE + 2 SET DATA TYPE + DROP COLUMN = 4 destructive
    // DISABLE ROW LEVEL SECURITY は非破壊、通過
    expect(results).toHaveLength(4);
  });

  test("passes Scenario C output (constraint strengthening)", () => {
    const sql = `ALTER TABLE "notes" ALTER COLUMN "body" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_name_unique" UNIQUE("name");`;
    expect(findDestructive(sql)).toHaveLength(0);
  });

  test("passes ADD COLUMN with NOT NULL default", () => {
    const sql = `ALTER TABLE "notes" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;`;
    expect(findDestructive(sql)).toHaveLength(0);
  });

  test("passes CREATE TABLE", () => {
    const sql = `CREATE TABLE "foo" ("id" serial PRIMARY KEY);`;
    expect(findDestructive(sql)).toHaveLength(0);
  });

  test("empty SQL", () => {
    expect(findDestructive("")).toHaveLength(0);
  });

  test("case-insensitive detection", () => {
    const sql = `drop table "foo";`;
    expect(findDestructive(sql)).toHaveLength(1);
  });
});

describe("computeChecksum", () => {
  test("same content produces same checksum", () => {
    expect(computeChecksum("hello")).toBe(computeChecksum("hello"));
  });

  test("different content produces different checksum", () => {
    expect(computeChecksum("hello")).not.toBe(computeChecksum("hello!"));
  });

  test("produces SHA-256 hex (64 chars)", () => {
    const hash = computeChecksum("hello");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});

describe("enumerateHooks", () => {
  test("returns empty array for missing dir", () => {
    expect(enumerateHooks("definitely-does-not-exist-dir")).toEqual([]);
  });

  test("sorts by filename lexicographically and classifies pre/post", () => {
    const dir = mkdtempSync(join(tmpdir(), "hooks-test-"));
    try {
      writeFileSync(join(dir, "20260501-b.pre.sql"), "-- b");
      writeFileSync(join(dir, "20260401-a.pre.sql"), "-- a");
      writeFileSync(join(dir, "20260601-c.post.sql"), "-- c");
      writeFileSync(join(dir, "README.md"), "skip me");
      writeFileSync(join(dir, "not-a-hook.txt"), "skip me");
      const hooks = enumerateHooks(dir);
      expect(hooks.map((h) => h.filename)).toEqual(["20260401-a.pre.sql", "20260501-b.pre.sql", "20260601-c.post.sql"]);
      expect(hooks[0].kind).toBe("pre");
      expect(hooks[1].kind).toBe("pre");
      expect(hooks[2].kind).toBe("post");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("computes checksum for each hook file", () => {
    const dir = mkdtempSync(join(tmpdir(), "hooks-test-"));
    try {
      writeFileSync(join(dir, "20260101-foo.pre.sql"), "SELECT 1;");
      const hooks = enumerateHooks(dir);
      expect(hooks[0].checksum).toBe(computeChecksum("SELECT 1;"));
      expect(hooks[0].content).toBe("SELECT 1;");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
