import { err, ok, type Result } from "../_result";
import type { IDatabaseBackupProvider } from "../port/database-backup-provider";
import type { IStorageProvider } from "../port/storage-provider";

const CONCURRENCY = 8;

export async function dumpBackup(
  primary: IStorageProvider,
  backup: IStorageProvider,
  db: IDatabaseBackupProvider,
): Promise<Result> {
  try {
    const date = formatDate(new Date());
    const [dbBytes, count] = await Promise.all([
      uploadDatabase(db, backup, date),
      uploadObjects(primary, backup, date),
    ]);

    return ok(`dumped to ${date}/ (db ${dbBytes} bytes + ${count} objects)`);
  } catch (e) {
    return err(e instanceof Error ? e.message : String(e));
  }
}

async function uploadDatabase(db: IDatabaseBackupProvider, backup: IStorageProvider, date: string): Promise<number> {
  const sql = await db.dump();
  const gzipped = Bun.gzipSync(sql);
  await backup.upload(`${date}/db.sql.gz`, gzipped, "application/gzip");
  return gzipped.byteLength;
}

async function uploadObjects(primary: IStorageProvider, backup: IStorageProvider, date: string): Promise<number> {
  let count = 0;
  const inflight = new Set<Promise<void>>();
  for await (const key of primary.list()) {
    // Start transfers without waiting so up to CONCURRENCY objects can be copied at once.
    const task = (async () => {
      const obj = await primary.get(key);
      // An object may disappear between listing and reading, for example when its note is deleted.
      if (!obj) return;
      await backup.uploadStream(`${date}/objects/${key}`, obj.body, obj.contentType);
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

function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
