import { Database } from "bun:sqlite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const DB_PATH = process.env.DB_PATH ?? "data/reknotes.sqlite";

let db: Database | null = null;

export function getDb(): Database {
  if (db) return db;

  db = new Database(DB_PATH, { create: true });

  // パフォーマンス最適化
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");
  db.exec("PRAGMA cache_size = -64000"); // 64MB
  db.exec("PRAGMA foreign_keys = ON");

  // スキーマ適用
  const schemaPath = join(import.meta.dir, "schema.sql");
  const schema = readFileSync(schemaPath, "utf-8");
  db.exec(schema);

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}
