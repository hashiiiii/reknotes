import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { DiffResult, ISchemaSync } from "../../application/port/schema-sync";

// drizzle-kit の import 解決が project の node_modules を辿れるよう、tmp は project 内の
// node_modules/.cache 配下に作る (/tmp だと module 解決が失敗する)
const CACHE_PARENT = "node_modules/.cache/reknotes-migrate";

export class DrizzleKitSchemaSync implements ISchemaSync {
  constructor(
    private readonly url: string,
    private readonly schemaPath: string,
  ) {}

  async generateDiff(): Promise<DiffResult> {
    mkdirSync(CACHE_PARENT, { recursive: true });
    const tmpOut = await mkdtemp(join(CACHE_PARENT, "run-"));
    try {
      // drizzle-kit は --config と他 CLI 引数 (--url など) を併用できない仕様。
      // --url を CLI に出すとクレデンシャルが ps aux に漏れるため、tmp 配下に config を動的生成し --config だけで呼ぶ。
      // DATABASE_URL は spawnDrizzle が env で渡し、tmp config の `process.env.DATABASE_URL!` が子プロセスで評価する。
      const tmpConfigPath = this.writeTempConfig(tmpOut);

      const introspectCode = this.spawn(["introspect", `--config=${tmpConfigPath}`]);
      if (introspectCode !== 0) {
        return { sql: null, error: "drizzle-kit introspect failed" };
      }

      // introspect 直後に存在する SQL ファイル (現 DB 構造の再構築 SQL)。空 DB では 0 件のこともある
      const beforeGenerate = listSqlFiles(tmpOut);
      const generateCode = this.spawn(["generate", `--config=${tmpConfigPath}`]);
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
      // drizzle-kit generate は通常 1 実行 1 ファイル。複数生成された場合は仕様変更の可能性があり、
      // 黙って末尾だけ読むと変更を取りこぼすため明示的にエラーにする。
      if (afterGenerate.length > 1) {
        return {
          sql: null,
          error: `drizzle-kit generate produced ${afterGenerate.length} files (expected 1): ${afterGenerate.join(", ")}`,
        };
      }
      const diffFile = join(tmpOut, afterGenerate[0]);
      return { sql: readFileSync(diffFile, "utf-8"), error: null };
    } finally {
      await rm(tmpOut, { recursive: true, force: true });
    }
  }

  async push(): Promise<void> {
    // TTY ありなら対話的に確認、なければ --force で自動適用
    const args = ["push", ...(process.stdin.isTTY ? [] : ["--force"])];
    const code = this.spawn(args);
    if (code !== 0) throw new Error(`drizzle-kit push exited with code ${code}`);
  }

  private writeTempConfig(tmpOut: string): string {
    const tmpConfigPath = join(tmpOut, "drizzle.config.ts");
    const absSchema = resolve(this.schemaPath);
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

  private spawn(args: string[]): number {
    const proc = Bun.spawnSync(["bunx", "drizzle-kit", ...args], {
      env: { ...process.env, DATABASE_URL: this.url },
      stdio: ["inherit", "inherit", "inherit"],
    });
    // SIGKILL / OOM kill 等で exitCode が null になった場合は失敗扱い
    return proc.exitCode ?? 1;
  }
}

function listSqlFiles(dir: string): Set<string> {
  return new Set(readdirSync(dir).filter((f) => /^[0-9]+_.*\.sql$/.test(f)));
}
