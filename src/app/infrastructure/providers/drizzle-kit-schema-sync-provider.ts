import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { DiffResult, ISchemaSyncProvider } from "../../application/port/schema-sync-provider";

// Temporary configuration files must stay under the project so drizzle-kit imports resolve
// through its node_modules; a system temporary directory breaks module resolution.
const CACHE_PARENT = "node_modules/.cache/reknotes-migrate";

export class DrizzleKitSchemaSyncProvider implements ISchemaSyncProvider {
  constructor(
    private readonly url: string,
    private readonly schemaPath: string,
  ) {}

  async generateDiff(): Promise<DiffResult> {
    mkdirSync(CACHE_PARENT, { recursive: true });
    const tmpOut = await mkdtemp(join(CACHE_PARENT, "run-"));
    try {
      // Passing the URL on the command line exposes credentials in process listings.
      // drizzle-kit cannot combine --config with --url, so the temporary config
      // reads DATABASE_URL from the child process's environment instead.
      const tmpConfigPath = this.writeTempConfig(tmpOut);

      const introspectCode = this.spawn(["introspect", `--config=${tmpConfigPath}`]);
      if (introspectCode !== 0) {
        return { sql: null, error: "drizzle-kit introspect failed" };
      }

      // An empty database may produce no introspection SQL.
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

      // Comparing file sets also works when introspection produced no SQL.
      const afterGenerate = [...listSqlFiles(tmpOut)].filter((f) => !beforeGenerate.has(f)).sort();
      if (afterGenerate.length === 0) return { sql: "", error: null };
      // The generate command normally writes one file. Reject unexpected output rather than
      // silently ignoring part of a migration if the tool's behavior changes.
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
    // Interactive terminals can confirm changes; unattended runs need --force.
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
  // The child evaluates this expression after spawn supplies its DATABASE_URL.
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
    // A signal or out-of-memory termination can leave no exit code and must count as failure.
    return proc.exitCode ?? 1;
  }
}

function listSqlFiles(dir: string): Set<string> {
  return new Set(readdirSync(dir).filter((f) => /^[0-9]+_.*\.sql$/.test(f)));
}
