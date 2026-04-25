import type { AppliedHook, HookFile } from "../../domain/migration/hook";

export interface IMigrationDatabase {
  /** 軽量クエリで DB 到達可否を確認する。3 秒程度の短い timeout で false に倒れる想定。 */
  probe(): Promise<boolean>;

  /** ローカル開発で対象 DB が無ければ作成する (remote 環境では no-op)。 */
  createLocalIfMissing(): Promise<void>;

  /** _hooks_applied テーブルが無ければ作成する。冪等。 */
  ensureHooksAppliedTable(): Promise<void>;

  /** _hooks_applied から既適用 hook を全件取得する。 */
  loadAppliedHooks(): Promise<AppliedHook[]>;

  /** 1 hook を実行し、_hooks_applied に登録する (単一トランザクション)。 */
  applyHook(hook: HookFile): Promise<void>;

  /** bootstrap: 全 hook を「実行せず登録のみ」する (単一トランザクション)。 */
  markHooksAsApplied(hooks: HookFile[]): Promise<void>;
}
