import type { Result } from "../../src/app/application/migration/_result";
import { applyMigration } from "../../src/app/application/migration/apply-migration";
import { bootstrapMigration } from "../../src/app/application/migration/bootstrap-migration";
import { checkMigration } from "../../src/app/application/migration/check-migration";
import type { IHookProvider } from "../../src/app/application/port/hook-provider";
import type { IMigrationProvider } from "../../src/app/application/port/migration-provider";
import type { ISchemaSyncProvider } from "../../src/app/application/port/schema-sync-provider";
import { loadConfig } from "../../src/app/config";
import {
  createHookProvider,
  createMigrationProvider,
  createSchemaSyncProvider,
} from "../../src/app/infrastructure/container";

type MigrationDeps = {
  db: IMigrationProvider;
  schema: ISchemaSyncProvider;
  hooks: IHookProvider;
};

const HELP_TEXT = `Usage: bun run migrate -- <mode>

Modes (one required):
  --apply       Apply pending hooks and run drizzle-kit push
  --check       Detect destructive changes without writing to DB
  --bootstrap   Mark all existing hooks as applied without executing them

Environment:
  DATABASE_URL  Required. Base connection URL.
  ENVIRONMENT   Required. development / test / etc.
  DEPLOYMENT    "remote" -> use DATABASE_URL as-is. Otherwise -> append /reknotes_<ENVIRONMENT>.

For destructive-change handling and hook authoring, see scripts/migration/hooks/README.md.
`;

type Mode = "apply" | "check" | "bootstrap" | "help";

function parseArgs(argv: string[]): Mode {
  const args = argv.slice(2).filter((a) => a !== "--");
  if (args.length !== 1) return "help";
  switch (args[0]) {
    case "--check":
      return "check";
    case "--bootstrap":
      return "bootstrap";
    case "--apply":
      return "apply";
    default:
      return "help";
  }
}

type RunMode = Exclude<Mode, "help">;

function dispatch(mode: RunMode, deps: MigrationDeps): Promise<Result> {
  switch (mode) {
    case "check":
      return checkMigration(deps);
    case "apply":
      return applyMigration(deps);
    case "bootstrap":
      return bootstrapMigration(deps);
  }
}

async function run(mode: Mode): Promise<number> {
  if (mode === "help") {
    console.log(HELP_TEXT);
    return 0;
  }

  console.log(`Running ${mode}...`);
  try {
    const config = loadConfig();
    const deps: MigrationDeps = {
      db: createMigrationProvider(config),
      schema: createSchemaSyncProvider(config),
      hooks: createHookProvider(),
    };
    const result = await dispatch(mode, deps);
    if (result.kind === "ok") {
      console.log(JSON.stringify(result));
      return 0;
    }
    console.error(JSON.stringify(result));
    return 1;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({ kind: "error", message }));
    return 1;
  }
}

// Bun の entry-point イディオム (Python の `if __name__ == "__main__":` 相当)。
if (import.meta.main) {
  process.exit(await run(parseArgs(process.argv)));
}
