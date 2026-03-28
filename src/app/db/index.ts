import { Database } from "bun:sqlite";
import { drizzle } from "drizzle-orm/bun-sqlite";
import * as schema from "./schema";

const dbPath = process.env.DB_PATH ?? "data/reknotes.sqlite";
const sqlite = new Database(dbPath);

sqlite.run("PRAGMA journal_mode = WAL");
sqlite.run("PRAGMA synchronous = NORMAL");
sqlite.run("PRAGMA cache_size = -64000"); // 64MB
sqlite.run("PRAGMA foreign_keys = ON");

export const db = drizzle(sqlite, { schema });
