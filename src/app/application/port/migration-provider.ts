import type { AppliedHook, HookFile } from "../../domain/migration/hook";

export interface IMigrationProvider {
  /** Local databases may need creation; managed databases are provisioned externally. */
  ensureDatabaseExists(): Promise<void>;

  /** A short timeout, around three seconds, keeps availability checks responsive. */
  probe(): Promise<boolean>;

  ensureHooksAppliedTable(): Promise<void>;

  loadAppliedHooks(): Promise<AppliedHook[]>;

  /** Hook execution and history updates must succeed or roll back together. Empty input is a no-op. */
  applyHooks(hooks: HookFile[]): Promise<void>;

  /** Bootstrap records existing hooks in one transaction without executing their SQL. */
  markHooksAsApplied(hooks: HookFile[]): Promise<void>;
}
