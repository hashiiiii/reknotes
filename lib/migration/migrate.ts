import { applyMigration } from "../../src/app/application/migration/apply-migration";
import { bootstrapMigration } from "../../src/app/application/migration/bootstrap-migration";
import { checkMigration } from "../../src/app/application/migration/check-migration";
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

For destructive-change handling and hook authoring, see lib/migration/hooks/README.md.
`;

type Mode = "apply" | "check" | "bootstrap";

type ParsedArgs = { kind: "mode"; mode: Mode } | { kind: "help" };

// 認識する 3 つの mode フラグ以外 (no args / 複数 args / 未知 / --help / -h) は全て help 扱い。
// no args をデフォルトで apply に倒さないことで、destructive 操作を暗黙起動するのを防ぐ。
function parseArgs(argv: string[]): ParsedArgs {
  const args = argv.slice(2).filter((a) => a !== "--");
  if (args.length === 1) {
    switch (args[0]) {
      case "--check":
        return { kind: "mode", mode: "check" };
      case "--bootstrap":
        return { kind: "mode", mode: "bootstrap" };
      case "--apply":
        return { kind: "mode", mode: "apply" };
    }
  }
  return { kind: "help" };
}

async function run(mode: Mode): Promise<boolean> {
  const deps = createMigrationDeps();
  if (mode !== "check") await deps.db.createLocalIfMissing();

  console.log(`Running ${mode}...`);
  try {
    const result =
      mode === "check"
        ? await checkMigration(deps)
        : mode === "apply"
          ? await applyMigration(deps)
          : await bootstrapMigration(deps);
    (result.kind === "ok" ? console.log : console.error)(JSON.stringify(result));
    return result.kind === "ok";
  } catch (e) {
    // use case が throw したものを Result と同じ形に整えて出す
    const message = e instanceof Error ? e.message : String(e);
    console.error(JSON.stringify({ kind: "error", message }));
    return false;
  }
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv);
  if (parsed.kind === "help") {
    console.log(HELP_TEXT);
    return 0;
  }
  return (await run(parsed.mode)) ? 0 : 1;
}

// Bun の entry-point イディオム (Python の `if __name__ == "__main__":` 相当)。
if (import.meta.main) {
  process.exit(await main());
}
