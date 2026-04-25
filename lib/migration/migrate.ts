import { type ApplyResult, applyMigration } from "../../src/app/application/migration/apply-migration";
import { type BootstrapResult, bootstrapMigration } from "../../src/app/application/migration/bootstrap-migration";
import { type CheckResult, checkMigration } from "../../src/app/application/migration/check-migration";
import { createMigrationDeps } from "../../src/app/infrastructure/container";

const HELP_TEXT = `Usage: bun run migrate [option]

Options:
  (none)        Apply pending hooks and run drizzle-kit push
  --check       Detect destructive changes without writing to DB
  --bootstrap   Mark all existing hooks as applied without executing them
  --help        Show this message

Environment:
  DATABASE_URL  Required. Base connection URL.
  ENVIRONMENT   Required. development / test / etc.
  DEPLOYMENT    "remote" -> use DATABASE_URL as-is. Otherwise -> append /reknotes_<ENVIRONMENT>.
`;

type Mode = "apply" | "check" | "bootstrap";

type ParsedArgs = { kind: "mode"; mode: Mode } | { kind: "help" } | { kind: "error"; message: string };

function parseArgs(argv: string[]): ParsedArgs {
  // `bun run migrate -- --check` の "--" セパレータが残るケースに備えて除外
  const args = argv.slice(2).filter((a) => a !== "--");
  if (args.length === 0) return { kind: "mode", mode: "apply" };
  if (args.length > 1) return { kind: "error", message: `unexpected extra arguments: ${args.slice(1).join(" ")}` };
  switch (args[0]) {
    case "--help":
    case "-h":
      return { kind: "help" };
    case "--check":
      return { kind: "mode", mode: "check" };
    case "--bootstrap":
      return { kind: "mode", mode: "bootstrap" };
    case "--apply":
      return { kind: "mode", mode: "apply" };
    default:
      return { kind: "error", message: `unknown option: ${args[0]}` };
  }
}

function printCheck(result: CheckResult): void {
  switch (result.kind) {
    case "skipped":
      console.warn(`Skipped destructive check (${result.reason})`);
      return;
    case "no-changes":
      console.log("No schema changes detected");
      return;
    case "safe":
      console.log("Schema changes are safe (no destructive operations)");
      return;
    case "destructive":
      console.error("Destructive changes detected (will not be auto-applied):");
      for (const s of result.statements) console.error(`  - ${s}`);
      console.error("\nSee lib/migration/hooks/README.md for manual handling.");
      return;
    case "error":
      console.error(result.message);
      return;
  }
}

function printApply(result: ApplyResult): void {
  switch (result.kind) {
    case "destructive":
      console.error("Destructive changes detected. Aborting apply.");
      for (const s of result.statements) console.error(`  - ${s}`);
      console.error("\nSee lib/migration/hooks/README.md for manual handling.");
      return;
    case "edited-hook": {
      const e = result.edited;
      console.error(
        `Applied hook was edited: ${e.filename} (prior=${e.priorChecksum.slice(0, 8)}, current=${e.currentChecksum.slice(0, 8)}). Revert the file or add a NEW hook with a later date.`,
      );
      return;
    }
    case "error":
      console.error(result.message);
      return;
    case "applied":
      if (result.preCount > 0) console.log(`Applied ${result.preCount} pre-hook(s)`);
      if (result.postCount > 0) console.log(`Applied ${result.postCount} post-hook(s)`);
      console.log("Migration complete");
      return;
  }
}

function printBootstrap(result: BootstrapResult): void {
  console.log(`Bootstrap complete (marked ${result.markedCount} hook(s) as applied)`);
}

// 各 use case の Result.kind のうち成功扱いするもの。これ以外は exit code 1。
const SUCCESS_KINDS = new Set(["skipped", "no-changes", "safe", "applied", "bootstrapped"]);

async function run(mode: Mode): Promise<boolean> {
  const deps = createMigrationDeps();

  // check モードでは DB 不在を unreachable と区別したいので作成しない
  if (mode !== "check") {
    await deps.db.createLocalIfMissing();
  }

  switch (mode) {
    case "check": {
      console.log("Running destructive-change check...");
      const result = await checkMigration(deps);
      printCheck(result);
      return SUCCESS_KINDS.has(result.kind);
    }
    case "apply": {
      console.log("Running apply migration...");
      const result = await applyMigration(deps);
      printApply(result);
      return SUCCESS_KINDS.has(result.kind);
    }
    case "bootstrap": {
      console.log("Running bootstrap...");
      const result = await bootstrapMigration(deps);
      printBootstrap(result);
      return SUCCESS_KINDS.has(result.kind);
    }
  }
}

async function main(): Promise<number> {
  const parsed = parseArgs(process.argv);
  if (parsed.kind === "help") {
    console.log(HELP_TEXT);
    return 0;
  }
  if (parsed.kind === "error") {
    console.error(`Error: ${parsed.message}\n`);
    console.error(HELP_TEXT);
    return 2;
  }
  return (await run(parsed.mode)) ? 0 : 1;
}

// Bun の entry-point イディオム (Python の `if __name__ == "__main__":` 相当)。
// 直接 `bun run` で起動された時のみ main を実行し、テスト等で import した場合は実行しない。
if (import.meta.main) {
  process.exit(await main());
}
