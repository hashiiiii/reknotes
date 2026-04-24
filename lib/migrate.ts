import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import postgres from "postgres";

// データ消失系 SQL のパターン。制約強化系 (SET NOT NULL / ADD UNIQUE) は意図的に含めない
const DESTRUCTIVE_PATTERNS = [/\bDROP\s+TABLE\b/i, /\bDROP\s+COLUMN\b/i, /\bSET\s+DATA\s+TYPE\b/i];

const HOOKS_DIR = "drizzle/migrations";
const SCHEMA_PATH = "./src/app/infrastructure/db/schema.ts";
// drizzle-kit の import 解決が project の node_modules を辿れるよう、tmp は project 内の
// node_modules/.cache 配下に作る (/tmp だと module 解決が失敗する)
const CACHE_PARENT = "node_modules/.cache/reknotes-migrate";

type Mode = "apply" | "check" | "bootstrap";

export type HookFile = {
  filename: string;
  kind: "pre" | "post";
  path: string;
  checksum: string;
  content: string;
};

export function findDestructive(sql: string): string[] {
  return sql
    .split(/;\s*(?:--> statement-breakpoint\s*)?/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .filter((s) => DESTRUCTIVE_PATTERNS.some((p) => p.test(s)));
}

export function computeChecksum(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

export function enumerateHooks(dir: string): HookFile[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir)
    .filter((f) => /\.(pre|post)\.sql$/.test(f))
    .sort();
  return entries.map((filename) => {
    const path = join(dir, filename);
    const content = readFileSync(path, "utf-8");
    const kind = filename.endsWith(".pre.sql") ? "pre" : "post";
    return { filename, kind, path, checksum: computeChecksum(content), content };
  });
}

function getDatabaseUrl(): string {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is not set");
  if (process.env.DEPLOYMENT === "remote") return databaseUrl;
  const environment = process.env.ENVIRONMENT;
  if (!environment) throw new Error("ENVIRONMENT is not set");
  return `${databaseUrl}/reknotes_${environment}`;
}

async function createLocalDatabaseIfMissing(url: string): Promise<void> {
  if (process.env.DEPLOYMENT === "remote") return;
  const dbName = new URL(url).pathname.slice(1);
  const adminUrl = url.replace(`/${dbName}`, "/postgres");
  const admin = postgres(adminUrl);
  try {
    await admin.unsafe(`CREATE DATABASE "${dbName}"`);
    console.log(`Created database: ${dbName}`);
  } catch (e) {
    if ((e as { code?: string }).code !== "42P04") throw e; // 42P04 = duplicate_database
  } finally {
    await admin.end();
  }
}

async function probeDatabase(url: string): Promise<boolean> {
  const probe = postgres(url, { max: 1, connect_timeout: 3, onnotice: () => {} });
  try {
    await probe`SELECT 1`;
    return true;
  } catch {
    return false;
  } finally {
    await probe.end({ timeout: 1 });
  }
}

async function ensureHooksAppliedTable(url: string): Promise<void> {
  const client = postgres(url, { onnotice: () => {} });
  try {
    await client.unsafe(`
      CREATE TABLE IF NOT EXISTS "_hooks_applied" (
        filename text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamp with time zone NOT NULL DEFAULT now()
      )
    `);
  } finally {
    await client.end();
  }
}

type AppliedHook = { filename: string; checksum: string };

async function loadAppliedHooks(url: string): Promise<AppliedHook[]> {
  const client = postgres(url, { onnotice: () => {} });
  try {
    const rows = await client<AppliedHook[]>`
      SELECT filename, checksum FROM "_hooks_applied"
    `;
    return [...rows];
  } finally {
    await client.end();
  }
}

async function applyHook(url: string, hook: HookFile): Promise<void> {
  const client = postgres(url, { onnotice: () => {} });
  try {
    await client.begin(async (tx) => {
      await tx.unsafe(hook.content);
      await tx.unsafe(`INSERT INTO "_hooks_applied" (filename, checksum) VALUES ($1, $2)`, [
        hook.filename,
        hook.checksum,
      ]);
    });
    console.log(`  applied ${hook.filename}`);
  } finally {
    await client.end();
  }
}

async function markHooksAsApplied(url: string, hooks: HookFile[]): Promise<void> {
  if (hooks.length === 0) return;
  const client = postgres(url, { onnotice: () => {} });
  try {
    // 全件成功 or 全件ロールバックを保証 (途中で切断されて一部だけ登録された状態を避ける)
    await client.begin(async (tx) => {
      for (const h of hooks) {
        await tx.unsafe(
          `INSERT INTO "_hooks_applied" (filename, checksum) VALUES ($1, $2) ON CONFLICT (filename) DO NOTHING`,
          [h.filename, h.checksum],
        );
      }
    });
    console.log(`  marked ${hooks.length} hook(s) as applied (bootstrap)`);
  } finally {
    await client.end();
  }
}

function spawnDrizzle(args: string[], url: string): number {
  const proc = Bun.spawnSync(["bunx", "drizzle-kit", ...args], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: ["inherit", "inherit", "inherit"],
  });
  // SIGKILL / OOM kill 等で exitCode が null になった場合は失敗扱い
  return proc.exitCode ?? 1;
}

function listSqlFiles(dir: string): Set<string> {
  return new Set(readdirSync(dir).filter((f) => /^[0-9]+_.*\.sql$/.test(f)));
}

function writeTempDrizzleConfig(tmpOut: string): string {
  const tmpConfigPath = join(tmpOut, "drizzle.config.ts");
  const absSchema = resolve(SCHEMA_PATH);
  writeFileSync(
    tmpConfigPath,
    `import { defineConfig } from "drizzle-kit";
export default defineConfig({
  dialect: "postgresql",
  schema: ${JSON.stringify(absSchema)},
  out: ${JSON.stringify(tmpOut)},
  dbCredentials: { url: process.env.DATABASE_URL! },
});
`,
  );
  return tmpConfigPath;
}

async function generateDiffSql(url: string): Promise<{ sql: string | null; error: string | null }> {
  mkdirSync(CACHE_PARENT, { recursive: true });
  const tmpOut = await mkdtemp(join(CACHE_PARENT, "run-"));
  try {
    // drizzle-kit は --config と他 CLI 引数 (--url など) を併用できない仕様。
    // --url を CLI に出すとクレデンシャルが ps aux に漏れるため、tmp 配下に config を動的生成し --config だけで呼ぶ。
    // DATABASE_URL は spawnDrizzle が env で渡し、tmp config の `process.env.DATABASE_URL!` が子プロセスで評価する。
    const tmpConfigPath = writeTempDrizzleConfig(tmpOut);
    const introspectCode = spawnDrizzle(["introspect", `--config=${tmpConfigPath}`], url);
    if (introspectCode !== 0) {
      return { sql: null, error: "drizzle-kit introspect failed" };
    }
    // introspect 直後に存在する SQL ファイル (現 DB 構造の再構築 SQL)。空 DB では 0 件のこともある
    const beforeGenerate = listSqlFiles(tmpOut);
    const generateCode = spawnDrizzle(["generate", `--config=${tmpConfigPath}`], url);
    if (generateCode !== 0) {
      return {
        sql: null,
        error:
          "drizzle-kit generate failed. Likely cause: rename detected (requires interactive TTY). " +
          "To handle: run `bunx drizzle-kit push` locally with TTY to resolve rename ambiguity.",
      };
    }
    // generate が新規追加した SQL ファイルだけが diff。introspect のファイル数に依存しないので空 DB でも正しく検出できる
    const afterGenerate = [...listSqlFiles(tmpOut)].filter((f) => !beforeGenerate.has(f)).sort();
    if (afterGenerate.length === 0) return { sql: "", error: null };
    const diffFile = join(tmpOut, afterGenerate[afterGenerate.length - 1]);
    return { sql: readFileSync(diffFile, "utf-8"), error: null };
  } finally {
    await rm(tmpOut, { recursive: true, force: true });
  }
}

function parseMode(argv: string[]): Mode {
  if (argv.includes("--check")) return "check";
  if (argv.includes("--bootstrap")) return "bootstrap";
  return "apply";
}

function redactUrl(url: string): string {
  return url.replace(/:[^@/]+@/, ":***@");
}

async function drizzlePush(url: string): Promise<number> {
  // TTY ありなら対話的に確認、なければ --force で自動適用
  const args = ["push", ...(process.stdin.isTTY ? [] : ["--force"])];
  return spawnDrizzle(args, url);
}

async function runCheck(url: string): Promise<number> {
  console.log("Running destructive-change check...");
  if (!(await probeDatabase(url))) {
    console.warn(`Skipped destructive check (DB unreachable at ${redactUrl(url)})`);
    return 0;
  }
  const { sql, error } = await generateDiffSql(url);
  if (error) {
    console.error(error);
    return 1;
  }
  if (!sql) {
    console.log("No schema changes detected");
    return 0;
  }
  const destructive = findDestructive(sql);
  if (destructive.length > 0) {
    console.error("Destructive changes detected (will not be auto-applied):");
    for (const d of destructive) console.error(`  - ${d}`);
    console.error("\nSee drizzle/migrations/README.md for manual handling.");
    return 1;
  }
  console.log("Schema changes are safe (no destructive operations)");
  return 0;
}

async function runApply(url: string): Promise<number> {
  console.log("Running apply migration...");
  await ensureHooksAppliedTable(url);
  const { sql, error } = await generateDiffSql(url);
  if (error) {
    console.error(error);
    return 1;
  }
  if (sql) {
    const destructive = findDestructive(sql);
    if (destructive.length > 0) {
      console.error("Destructive changes detected. Aborting apply.");
      for (const d of destructive) console.error(`  - ${d}`);
      console.error("\nSee drizzle/migrations/README.md for manual handling.");
      return 1;
    }
  }
  const hooks = enumerateHooks(HOOKS_DIR);
  const applied = await loadAppliedHooks(url);
  const appliedMap = new Map(applied.map((h) => [h.filename, h.checksum]));
  for (const h of hooks) {
    const prior = appliedMap.get(h.filename);
    if (prior !== undefined && prior !== h.checksum) {
      console.error(
        `Applied hook was edited: ${h.filename}\n` +
          `   Original checksum: ${prior}\n` +
          `   Current checksum:  ${h.checksum}\n` +
          `   To fix: revert the file, or add a NEW hook with a later date.`,
      );
      return 1;
    }
  }
  const pendingPre = hooks.filter((h) => h.kind === "pre" && !appliedMap.has(h.filename));
  if (pendingPre.length > 0) {
    console.log(`Applying ${pendingPre.length} pre-hook(s)...`);
    for (const h of pendingPre) await applyHook(url, h);
  }
  console.log("Syncing schema via drizzle-kit push...");
  const pushCode = await drizzlePush(url);
  if (pushCode !== 0) return pushCode;
  const pendingPost = hooks.filter((h) => h.kind === "post" && !appliedMap.has(h.filename));
  if (pendingPost.length > 0) {
    console.log(`Applying ${pendingPost.length} post-hook(s)...`);
    for (const h of pendingPost) await applyHook(url, h);
  }
  console.log("Migration complete");
  return 0;
}

async function runBootstrap(url: string): Promise<number> {
  console.log("Running bootstrap...");
  console.log("Syncing schema via drizzle-kit push...");
  const pushCode = await drizzlePush(url);
  if (pushCode !== 0) return pushCode;
  await ensureHooksAppliedTable(url);
  const hooks = enumerateHooks(HOOKS_DIR);
  await markHooksAsApplied(url, hooks);
  console.log("Bootstrap complete");
  return 0;
}

async function main(): Promise<number> {
  const mode = parseMode(process.argv);
  const url = getDatabaseUrl();
  if (mode !== "check") await createLocalDatabaseIfMissing(url);
  switch (mode) {
    case "apply":
      return runApply(url);
    case "check":
      return runCheck(url);
    case "bootstrap":
      return runBootstrap(url);
  }
}

if (import.meta.main) {
  const code = await main();
  process.exit(code);
}
