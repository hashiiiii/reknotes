import type { HookFile } from "../../domain/migration/hook";

export interface IHookProvider {
  /** Filename order defines the deployment order of hooks. */
  list(): HookFile[];
}
