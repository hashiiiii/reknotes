import type { IDatabaseBackupProvider } from "../../application/port/database-backup-provider";
import type { Deployment } from "../../config";

export class PgDatabaseBackupProvider implements IDatabaseBackupProvider {
  constructor(
    private readonly databaseUrl: string,
    private readonly pgImage: string,
    private readonly deployment: Deployment,
  ) {}

  async dump(): Promise<Uint8Array<ArrayBuffer>> {
    // --no-owner / --no-privileges: restore 先がオリジナルと別ロール構成でも動くようにする。
    const proc = Bun.spawn(
      [...this.dockerArgs(), "pg_dump", this.resolveDatabaseUrl(), "--format=plain", "--no-owner", "--no-privileges"],
      {
        stdout: "pipe",
        stderr: "pipe",
      },
    );

    const [buffer, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).arrayBuffer(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);

    if (exitCode !== 0) {
      throw new Error(`pg_dump exited with code ${exitCode}: ${stderr.trim()}`);
    }
    return new Uint8Array(buffer);
  }

  async restore(sql: Uint8Array<ArrayBuffer>): Promise<void> {
    // ON_ERROR_STOP=1: SQL のエラーで即時 abort
    const proc = Bun.spawn([...this.dockerArgs(), "psql", this.resolveDatabaseUrl(), "-v", "ON_ERROR_STOP=1"], {
      stdin: sql,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);

    if (exitCode !== 0) {
      throw new Error(`psql exited with code ${exitCode}: ${stderr.trim()}`);
    }
  }

  private dockerArgs(): string[] {
    return ["docker", "run", "--rm", "-i", "--add-host=host.docker.internal:host-gateway", this.pgImage];
  }

  private resolveDatabaseUrl(): string {
    if (this.deployment !== "local") return this.databaseUrl;
    const url = new URL(this.databaseUrl);
    if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      throw new Error(`deployment=local expects DATABASE_URL host to be localhost or 127.0.0.1, got "${url.hostname}"`);
    }
    url.hostname = "host.docker.internal";
    return url.toString();
  }
}
