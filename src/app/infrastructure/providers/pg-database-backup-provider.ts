import { execFileSync } from "node:child_process";
import type { IDatabaseBackupProvider } from "../../application/port/database-backup-provider";
import type { Deployment } from "../../config";

export class PgDatabaseBackupProvider implements IDatabaseBackupProvider {
  constructor(
    private readonly databaseUrl: string,
    private readonly pgImage: string,
    private readonly deployment: Deployment,
  ) {}

  async dump(): Promise<Uint8Array<ArrayBuffer>> {
    // Restores must work even when the destination has different roles and grants.
    const proc = Bun.spawn(this.postgresCommand("pg_dump", "--format=plain", "--no-owner", "--no-privileges"), {
      stdout: "pipe",
      stderr: "pipe",
    });

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
    // Stop at the first SQL error rather than continuing a partially failed restore.
    const proc = Bun.spawn(this.postgresCommand("psql", "-v", "ON_ERROR_STOP=1"), {
      stdin: sql,
      stdout: "pipe",
      stderr: "pipe",
    });

    const [stderr, exitCode] = await Promise.all([new Response(proc.stderr).text(), proc.exited]);

    if (exitCode !== 0) {
      throw new Error(`psql exited with code ${exitCode}: ${stderr.trim()}`);
    }
  }

  private postgresCommand(tool: "pg_dump" | "psql", ...flags: string[]): string[] {
    const args = ["docker", "run", "--rm", "-i"];
    if (this.deployment === "remote") return [...args, this.pgImage, tool, this.databaseUrl, ...flags];

    const url = new URL(this.databaseUrl);
    if (url.hostname !== "localhost" && url.hostname !== "127.0.0.1") {
      throw new Error(`deployment=local expects DATABASE_URL host to be localhost or 127.0.0.1, got "${url.hostname}"`);
    }

    // Native Linux needs the host network to reach a loopback-only port.
    // Docker Desktop forwards host connections across its VM instead.
    const nativeLinux =
      process.platform === "linux" &&
      execFileSync("docker", ["info", "--format", "{{.OperatingSystem}}"], { encoding: "utf8" }).trim() !==
        "Docker Desktop";
    if (nativeLinux) {
      args.push("--network=host");
    } else {
      args.push("--add-host=host.docker.internal:host-gateway");
      url.hostname = "host.docker.internal";
    }
    return [...args, this.pgImage, tool, url.toString(), ...flags];
  }
}
