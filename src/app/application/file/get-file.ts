import type { IStorageService } from "../../domain/storage/storage-service";

export async function getFile(storageService: IStorageService, key: string) {
  return storageService.get(key);
}
