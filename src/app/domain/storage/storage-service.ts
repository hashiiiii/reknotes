export interface IStorageService {
  upload(key: string, buffer: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream; contentType: string } | null>;
}
