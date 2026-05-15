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
    // アプリは key をフラットに参照するので、target へ書き戻すときは date prefix を剥がす
    const key = fullKey.slice(prefix.length);
    // あえて await しない
    const task = (async () => {
      const obj = await backup.get(fullKey);
      // backup bucket は lifecycle 以外で消えない静的データなので、list 後に get できないなら異常
      if (!obj) throw new Error(`backup object disappeared during restore: ${fullKey}`);
      await target.uploadStream(key, obj.body, obj.contentType);
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
