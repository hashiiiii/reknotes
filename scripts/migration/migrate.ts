import { applyMigration } from "../../src/app/application/migration/apply-migration";
import { bootstrapMigration } from "../../src/app/application/migration/bootstrap-migration";
import { checkMigration } from "../../src/app/application/migration/check-migration";
import type { Result } from "../../src/app/application/migration/result";
import { createMigrationDeps } from "../../src/app/infrastructure/container";

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

// 認識する 3 つの mode フラグ以外 (no args / 複数 args / 未知 / --help / -h) は全て help 扱い。
// no args をデフォルトで apply に倒さないことで、destructive 操作を暗黙起動するのを防ぐ。
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

function dispatch(mode: RunMode, deps: ReturnType<typeof createMigrationDeps>): Promise<Result> {
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
    const result = await dispatch(mode, createMigrationDeps());
    if (result.kind === "ok") {
      console.log(JSON.stringify(result));
      return 0;
    }
    console.error(JSON.stringify(result));
    return 1;
  } catch (e) {
    // use case が throw したものを Result と同じ形に整えて出す
    const message = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({ kind: "error", message }));
    return 1;
  }
}

// Bun の entry-point イディオム (Python の `if __name__ == "__main__":` 相当)。
if (import.meta.main) {
  process.exit(await run(parseArgs(process.argv)));
}
