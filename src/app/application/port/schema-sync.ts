export type DiffResult = { sql: string; error: null } | { sql: null; error: string };

export interface ISchemaSync {
  /**
   * 現 DB と schema.ts の差分 SQL を生成する (DB は変更しない)。
   * sql === "" は差分なし、sql に内容ありで非破壊な場合はそのまま push 候補、
   * error 非 null は drizzle-kit 自身の失敗 (rename 検出による非 TTY エラー等)。
   */
  generateDiff(): Promise<DiffResult>;

  /** drizzle-kit push --force で schema.ts と DB を同期する。 */
  push(): Promise<void>;
}
