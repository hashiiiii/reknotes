import postgres from "postgres";
import type { IMigrationDatabase } from "../../application/port/migration-database";
import type { AppliedHook, HookFile } from "../../domain/migration/hook";

export class PostgresMigrationDatabase implements IMigrationDatabase {
  constructor(
    private readonly url: string,
    private readonly isRemote: boolean,
  ) {}

  async probe(): Promise<boolean> {
    const probe = postgres(this.url, { max: 1, connect_timeout: 3, onnotice: () => {} });
    try {
      await probe`SELECT 1`;
      return true;
    } catch {
      return false;
    } finally {
      await probe.end({ timeout: 1 });
    }
  }

  async ensureDatabaseExists(): Promise<void> {
    if (this.isRemote) return;
    const parsed = new URL(this.url);
    const dbName = parsed.pathname.slice(1);
    parsed.pathname = "/postgres";
    const adminUrl = parsed.toString();
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

  async ensureHooksAppliedTable(): Promise<void> {
    const client = postgres(this.url, { onnotice: () => {} });
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

  async loadAppliedHooks(): Promise<AppliedHook[]> {
    const client = postgres(this.url, { onnotice: () => {} });
    try {
      const rows = await client<AppliedHook[]>`
        SELECT filename, checksum FROM "_hooks_applied"
      `;
      return [...rows];
    } finally {
      await client.end();
    }
  }

  async applyHooks(hooks: HookFile[]): Promise<void> {
    if (hooks.length === 0) return;
    const client = postgres(this.url, { onnotice: () => {} });
    try {
      // 1 接続 + 1 トランザクションで全 hook を適用 (N+1 接続を避ける)
      await client.begin(async (tx) => {
        for (const hook of hooks) {
          // tx tagged-template は postgres.js の TransactionSql<{}> 型問題で TS2349 に当たるので unsafe + params を使う
          await tx.unsafe(hook.content);
          await tx.unsafe(`INSERT INTO "_hooks_applied" (filename, checksum) VALUES ($1, $2)`, [
            hook.filename,
            hook.checksum,
          ]);
        }
      });
    } finally {
      await client.end();
    }
  }

  async markHooksAsApplied(hooks: HookFile[]): Promise<void> {
    if (hooks.length === 0) return;
    const client = postgres(this.url, { onnotice: () => {} });
    try {
      // 全件成功 or 全件ロールバックを保証
      await client.begin(async (tx) => {
        for (const h of hooks) {
          await tx.unsafe(
            `INSERT INTO "_hooks_applied" (filename, checksum) VALUES ($1, $2) ON CONFLICT (filename) DO NOTHING`,
            [h.filename, h.checksum],
          );
        }
      });
    } finally {
      await client.end();
    }
  }
}
