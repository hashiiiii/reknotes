import type { IStorageProvider } from "../port/storage-provider";

export async function getFile(storageProvider: IStorageProvider, key: string) {
  return storageProvider.get(key);
}
