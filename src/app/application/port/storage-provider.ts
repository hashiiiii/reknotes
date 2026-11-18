export interface IStorageProvider {
  upload(key: string, buffer: Uint8Array, contentType: string): Promise<void>;
  uploadStream(key: string, body: ReadableStream, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream; contentType: string } | null>;
  delete(key: string): Promise<void>;
  // Backup callers must not need pagination logic. Keys remain relative to the
  // bucket root, including any requested prefix, so callers can read them directly.
  list(prefix?: string): AsyncIterable<string>;
}
