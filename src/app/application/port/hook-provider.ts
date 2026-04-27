import type { HookFile } from "../../domain/migration/hook";

export interface IHookProvider {
  /** ファイル名昇順 (= デプロイ時系列順) で hook ファイルの一覧を返す。 */
  list(): HookFile[];
}
