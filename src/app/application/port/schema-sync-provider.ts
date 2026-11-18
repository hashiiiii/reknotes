export type DiffResult = { sql: string; error: null } | { sql: null; error: string };

export interface ISchemaSyncProvider {
  /**
   * Inspection must leave the database unchanged. Empty SQL means no changes;
   * nonempty SQL can be pushed if it is not destructive. An error means the tool
   * failed, for example because a rename needs an interactive terminal.
   */
  generateDiff(): Promise<DiffResult>;

  /** Synchronization uses drizzle-kit push --force after the caller has checked the diff. */
  push(): Promise<void>;
}
