import type { INoteRepository } from "../../domain/note/note-repository";
import type { ITagRepository } from "../../domain/tag/tag-repository";
import { extractUploadedFileKeys } from "../file/_file-url";
import type { IStorageProvider } from "../port/storage-provider";
import { removeOrphanTag } from "../tag/remove-orphan-tag";
import { isProcessing } from "./_processing-notes";

export async function deleteNote(
  noteRepo: INoteRepository,
  tagRepo: ITagRepository,
  storageProvider: IStorageProvider,
  id: number,
): Promise<boolean | "processing"> {
  // バックグラウンドのタグ再生成・掃除と競合しないよう、処理中の削除は拒否する。
  // ハングしてもプロセス再起動でレジストリごと解除されるので脱出路は要らない。
  if (isProcessing(id)) return "processing";

  const note = await noteRepo.findById(id);
  const tagNames = await noteRepo.findTagsByNoteId(id);
  const result = await noteRepo.delete(id);

  if (result) {
    if (note) {
      const keys = extractUploadedFileKeys(note.body);
      await Promise.all(keys.map((key) => storageProvider.delete(key)));
    }

    for (const tagName of tagNames) {
      await removeOrphanTag(tagRepo, tagName);
    }
  }

  return result;
}
