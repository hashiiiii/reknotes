export interface IDatabaseBackupProvider {
  dump(): Promise<Uint8Array<ArrayBuffer>>;
  restore(sql: Uint8Array<ArrayBuffer>): Promise<void>;
}
