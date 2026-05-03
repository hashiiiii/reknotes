import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type DrizzleDb = PostgresJsDatabase<typeof schema>;

export function createDb(databaseUrl: string): DrizzleDb {
  const client = postgres(databaseUrl);
  return drizzle(client, { schema });
}
