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
  // `bun run migrate -- --check` の "--" セパレータが残るケースに備えて除外
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

// kind ごとに整形した文章を組み立てず、Result 構造体を 1 行 JSON でそのまま出す。
// kind が増えても print 関数を変更する必要がなく、ログ仕様が Result 型から一意に決まる。
const FAILURE_KINDS = new Set(["destructive", "edited-hook", "error"]);

function print<R extends { kind: string }>(result: R): boolean {
  const failed = FAILURE_KINDS.has(result.kind);
  (failed ? console.error : console.log)(JSON.stringify(result));
  return !failed;
}

async function run(mode: Mode): Promise<boolean> {
  const deps = createMigrationDeps();

  // check モードでは DB 不在を unreachable と区別したいので作成しない
  if (mode !== "check") await deps.db.createLocalIfMissing();

  console.log(`Running ${mode}...`);
  switch (mode) {
    case "check":
      return print(await checkMigration(deps));
    case "apply":
      return print(await applyMigration(deps));
    case "bootstrap":
      return print(await bootstrapMigration(deps));
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
// 直接 `bun run` で起動された時のみ main を実行し、テスト等で import した場合は実行しない。
if (import.meta.main) {
  process.exit(await main());
}
