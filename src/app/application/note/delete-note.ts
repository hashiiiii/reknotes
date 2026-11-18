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
  // Deletion must not race with background tagging and cleanup.
  // Restarting clears the processing registry if a job gets stuck.
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
