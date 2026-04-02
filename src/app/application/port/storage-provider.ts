export interface IStorageProvider {
  ensureBucket(): Promise<void>;
  upload(key: string, buffer: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream; contentType: string } | null>;
  delete(key: string): Promise<void>;
}
