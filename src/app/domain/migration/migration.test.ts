import { describe, expect, test } from "bun:test";
import { computeChecksum } from "./checksum";
import { findDestructive } from "./destructive";
import { classifyHook, isHookFilename, sortHooks } from "./hook";

describe("findDestructive", () => {
  test("detects DROP TABLE", () => {
    expect(findDestructive(`DROP TABLE "note_tags" CASCADE;`)).toHaveLength(1);
  });

  test("detects DROP COLUMN", () => {
    expect(findDestructive(`ALTER TABLE "notes" DROP COLUMN "title";`)).toHaveLength(1);
  });

  test("detects SET DATA TYPE", () => {
    expect(findDestructive(`ALTER TABLE "notes" ALTER COLUMN "created_at" SET DATA TYPE integer;`)).toHaveLength(1);
  });

  test("Scenario A real drizzle-kit fixture detects 4 of 5 statements", () => {
    const sql = `ALTER TABLE "note_tags" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "note_tags" CASCADE;--> statement-breakpoint
ALTER TABLE "notes" ALTER COLUMN "created_at" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "notes" ALTER COLUMN "updated_at" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "notes" DROP COLUMN "title";`;
    // DROP TABLE + 2 SET DATA TYPE + DROP COLUMN = 4 destructive (DISABLE ROW LEVEL SECURITY は通過)
    expect(findDestructive(sql)).toHaveLength(4);
  });

  test("passes constraint-strengthening (Scenario C)", () => {
    const sql = `ALTER TABLE "notes" ALTER COLUMN "body" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tags" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_name_unique" UNIQUE("name");`;
    expect(findDestructive(sql)).toHaveLength(0);
  });

  test("passes ADD COLUMN with NOT NULL default", () => {
    expect(findDestructive(`ALTER TABLE "notes" ADD COLUMN "priority" integer DEFAULT 0 NOT NULL;`)).toHaveLength(0);
  });

  test("passes CREATE TABLE", () => {
    expect(findDestructive(`CREATE TABLE "foo" ("id" serial PRIMARY KEY);`)).toHaveLength(0);
  });

  test("empty SQL", () => {
    expect(findDestructive("")).toHaveLength(0);
  });

  test("case-insensitive", () => {
    expect(findDestructive(`drop table "foo";`)).toHaveLength(1);
  });
});

describe("computeChecksum", () => {
  test("same content -> same checksum", () => {
    expect(computeChecksum("hello")).toBe(computeChecksum("hello"));
  });

  test("different content -> different checksum", () => {
    expect(computeChecksum("hello")).not.toBe(computeChecksum("hello!"));
  });

  test("64-char hex", () => {
    const hash = computeChecksum("hello");
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]+$/);
  });
});

describe("hook helpers", () => {
  test("isHookFilename matches *.pre.sql / *.post.sql only", () => {
    expect(isHookFilename("20260101-foo.pre.sql")).toBe(true);
    expect(isHookFilename("20260101-foo.post.sql")).toBe(true);
    expect(isHookFilename("README.md")).toBe(false);
    expect(isHookFilename("20260101-foo.sql")).toBe(false);
    expect(isHookFilename("20260101-foo.pre.txt")).toBe(false);
  });

  test("classifyHook returns kind", () => {
    expect(classifyHook("20260101-foo.pre.sql")).toBe("pre");
    expect(classifyHook("20260101-foo.post.sql")).toBe("post");
  });

  test("sortHooks preserves lexicographic order", () => {
    const hooks = [
      { filename: "20260601-c.post.sql", kind: "post" as const, checksum: "c", content: "" },
      { filename: "20260101-a.pre.sql", kind: "pre" as const, checksum: "a", content: "" },
      { filename: "20260301-b.pre.sql", kind: "pre" as const, checksum: "b", content: "" },
    ];
    expect(sortHooks(hooks).map((h) => h.filename)).toEqual([
      "20260101-a.pre.sql",
      "20260301-b.pre.sql",
      "20260601-c.post.sql",
    ]);
  });
});
