export interface IStorageProvider {
  upload(key: string, buffer: Uint8Array, contentType: string): Promise<void>;
  uploadStream(key: string, body: ReadableStream, contentType: string): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream; contentType: string } | null>;
  delete(key: string): Promise<void>;
  // backup / restore で bucket 全体を列挙するために使用する。
  // ページングを呼び出し側に意識させない AsyncIterable で公開する。
  // 返るキーは bucket 直下からの絶対パス (prefix を渡しても剥がさない)。
  list(prefix?: string): AsyncIterable<string>;
}
