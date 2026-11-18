import type { IStorageProvider } from "../port/storage-provider";
import { isAllowedContentType } from "./_allowed-types";

// Uploaders control S3 metadata, so serving must enforce the MIME allowlist too
// (GHSA-g8cw-cxgp-g6r8).
export async function getFile(storageProvider: IStorageProvider, key: string) {
  const file = await storageProvider.get(key);
  if (!file) return null;
  if (!isAllowedContentType(file.contentType)) return null;
  return file;
}
