import type { IStorageProvider } from "../port/storage-provider";
import { isAllowedContentType } from "./_allowed-types";

// S3 metadata の content-type は upload 時に何でも付与できるため、配信側でも
// アップロード許可リストと整合する MIME のみ返す (GHSA-g8cw-cxgp-g6r8)。
export async function getFile(storageProvider: IStorageProvider, key: string) {
  const file = await storageProvider.get(key);
  if (!file) return null;
  if (!isAllowedContentType(file.contentType)) return null;
  return file;
}
