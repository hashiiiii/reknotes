import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  if (process.env.DEPLOYMENT === "remote") {
    return databaseUrl;
  } else {
    const environment = process.env.ENVIRONMENT;
    if (!environment) throw new Error("ENVIRONMENT is not set");
    return `${databaseUrl}/reknotes_${environment}`;
  }
}

const client = postgres(getDatabaseUrl());
export const db = drizzle(client, { schema });
export type DrizzleDb = typeof db;
