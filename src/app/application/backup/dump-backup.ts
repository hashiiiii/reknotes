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
    // あえて await しない
    const task = (async () => {
      const obj = await primary.get(key);
      // list 後 get 前にノートが削除された場合や、それ以外の何かしらの原因で null を返すようなケースを想定しておく
      if (!obj) return;
      await backup.uploadStream(`${date}/objects/${key}`, obj.body, obj.contentType);
      count += 1;
    })();
    // 実行中のタスクを管理することで、並行数を閾値以下に保つ
    inflight.add(task);
    task.then(
      // 成功・失敗問わずリストからは削除する
      () => inflight.delete(task),
      () => inflight.delete(task),
    );
    // 実行中のタスク数が閾値に達した場合は待機する
    if (inflight.size >= CONCURRENCY) await Promise.race(inflight);
  }
  // ループを抜けた後に残っているものを await
  await Promise.all(inflight);
  return count;
}

// YYYY-MM-DD
function formatDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
