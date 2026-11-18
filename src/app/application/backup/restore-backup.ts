import { err, ok, type Result } from "../_result";
import type { IDatabaseBackupProvider } from "../port/database-backup-provider";
import type { IStorageProvider } from "../port/storage-provider";

const CONCURRENCY = 8;

export async function restoreBackup(
  backup: IStorageProvider,
  target: IStorageProvider,
  db: IDatabaseBackupProvider,
  date: string,
): Promise<Result> {
  try {
    const [dbBytes, count] = await Promise.all([
      restoreDatabase(db, backup, date),
      restoreObjects(backup, target, date),
    ]);

    return ok(`restored from ${date}/ (db ${dbBytes} bytes + ${count} objects)`);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

async function restoreDatabase(db: IDatabaseBackupProvider, backup: IStorageProvider, date: string): Promise<number> {
  const dbKey = `${date}/db.sql.gz`;
  const obj = await backup.get(dbKey);
  if (!obj) throw new Error(`backup not found: ${dbKey}`);
  const gzipped = new Uint8Array(await new Response(obj.body).arrayBuffer());
  const sql = Bun.gunzipSync(gzipped);
  await db.restore(sql);
  return sql.byteLength;
}

async function restoreObjects(backup: IStorageProvider, target: IStorageProvider, date: string): Promise<number> {
  const prefix = `${date}/objects/`;
  let count = 0;
  const inflight = new Set<Promise<void>>();
  for await (const fullKey of backup.list(prefix)) {
    // Notes reference keys at the bucket root, without the backup date prefix.
    const key = fullKey.slice(prefix.length);
    // Start transfers without waiting so up to CONCURRENCY objects can be restored at once.
    const task = (async () => {
      const obj = await backup.get(fullKey);
      // Backup objects are static except for lifecycle expiry; a missing object invalidates the restore.
      if (!obj) throw new Error(`backup object disappeared during restore: ${fullKey}`);
      await target.uploadStream(key, obj.body, obj.contentType);
      count += 1;
    })();
    inflight.add(task);
    task.then(
      () => inflight.delete(task),
      () => inflight.delete(task),
    );
    if (inflight.size >= CONCURRENCY) await Promise.race(inflight);
  }
  await Promise.all(inflight);
  return count;
}
