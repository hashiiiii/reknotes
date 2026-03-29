import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function getDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const env = process.env.NODE_ENV;
  if (!env) throw new Error("NODE_ENV is not set");
  const base = process.env.DATABASE_URL_BASE;
  if (!base) throw new Error("DATABASE_URL_BASE is not set");
  return `${base}/reknotes_${env}`;
}

const client = postgres(getDatabaseUrl());
export const db = drizzle(client, { schema });
export type DrizzleDb = typeof db;
