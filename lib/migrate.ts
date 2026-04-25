import { type ApplyResult, applyMigration } from "../src/app/application/migration/apply-migration";
import { type BootstrapResult, bootstrapMigration } from "../src/app/application/migration/bootstrap-migration";
import { type CheckResult, checkMigration } from "../src/app/application/migration/check-migration";
import { DrizzleKitSchemaSync } from "../src/app/infrastructure/migration/drizzle-kit-schema-sync";
import { FsHookSource } from "../src/app/infrastructure/migration/fs-hook-source";
import { PostgresMigrationDatabase } from "../src/app/infrastructure/migration/postgres-migration-database";

const HOOKS_DIR = "drizzle/migrations";
const SCHEMA_PATH = "./src/app/infrastructure/db/schema.ts";

type Mode = "apply" | "check" | "bootstrap";

function parseMode(argv: string[]): Mode {
  if (argv.includes("--check")) return "check";
  if (argv.includes("--bootstrap")) return "bootstrap";
  return "apply";
}

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  if (process.env.DEPLOYMENT === "remote") return databaseUrl;
  const environment = process.env.ENVIRONMENT;
  if (!environment) throw new Error("ENVIRONMENT is not set");
  return `${databaseUrl}/reknotes_${environment}`;
}

function redactUrl(url: string): string {
  return url.replace(/:[^@/]+@/, ":***@");
}

function buildDeps(url: string, isRemote: boolean) {
  const db = new PostgresMigrationDatabase(url, isRemote);
  const schema = new DrizzleKitSchemaSync(url, SCHEMA_PATH);
  const hooks = new FsHookSource(HOOKS_DIR);
  return { db, schema, hooks };
}

function reportCheck(result: CheckResult, url: string): number {
  switch (result.kind) {
    case "skipped":
      console.warn(`Skipped destructive check (${result.reason} at ${redactUrl(url)})`);
      return 0;
    case "no-changes":
      console.log("No schema changes detected");
      return 0;
    case "safe":
      console.log("Schema changes are safe (no destructive operations)");
      return 0;
    case "destructive":
      console.error("Destructive changes detected (will not be auto-applied):");
      for (const s of result.statements) console.error(`  - ${s}`);
      console.error("\nSee drizzle/migrations/README.md for manual handling.");
      return 1;
    case "error":
      console.error(result.message);
      return 1;
  }
}

function reportApply(result: ApplyResult): number {
  switch (result.kind) {
    case "destructive":
      console.error("Destructive changes detected. Aborting apply.");
      for (const s of result.statements) console.error(`  - ${s}`);
      console.error("\nSee drizzle/migrations/README.md for manual handling.");
      return 1;
    case "edited-hook":
      console.error(
        `Applied hook was edited: ${result.edited.filename}\n` +
          `   Original checksum: ${result.edited.priorChecksum}\n` +
          `   Current checksum:  ${result.edited.currentChecksum}\n` +
          `   To fix: revert the file, or add a NEW hook with a later date.`,
      );
      return 1;
    case "error":
      console.error(result.message);
      return 1;
    case "applied":
      if (result.preCount > 0) console.log(`Applied ${result.preCount} pre-hook(s)`);
      if (result.postCount > 0) console.log(`Applied ${result.postCount} post-hook(s)`);
      console.log("Migration complete");
      return 0;
  }
}

function reportBootstrap(result: BootstrapResult): number {
  console.log(`Bootstrap complete (marked ${result.markedCount} hook(s) as applied)`);
  return 0;
}

async function main(): Promise<number> {
  const mode = parseMode(process.argv);
  const url = getDatabaseUrl();
  const isRemote = process.env.DEPLOYMENT === "remote";
  const deps = buildDeps(url, isRemote);

  if (mode !== "check") {
    await deps.db.createLocalIfMissing();
  }

  switch (mode) {
    case "check": {
      console.log("Running destructive-change check...");
      const result = await checkMigration({ db: deps.db, schema: deps.schema });
      return reportCheck(result, url);
    }
    case "apply": {
      console.log("Running apply migration...");
      const result = await applyMigration(deps);
      return reportApply(result);
    }
    case "bootstrap": {
      console.log("Running bootstrap...");
      const result = await bootstrapMigration(deps);
      return reportBootstrap(result);
    }
  }
}

if (import.meta.main) {
  const code = await main();
  process.exit(code);
}
