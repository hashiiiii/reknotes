import type { INoteRepository } from "../../domain/note/note-repository";
import type { ITagRepository } from "../../domain/tag/tag-repository";
import type { IStorageProvider } from "../port/storage-provider";
import { removeOrphanTag } from "../tag/remove-orphan-tag";

const FILE_KEY_PATTERN = /\/api\/files\/([^\s)"\]]+)/g;

export function extractAssetKeys(body: string): string[] {
  return [...body.matchAll(FILE_KEY_PATTERN)].map((m) => m[1]);
}

export async function deleteNote(
  noteRepo: INoteRepository,
  tagRepo: ITagRepository,
  storageProvider: IStorageProvider,
  id: number,
) {
  const [note, tagNames] = await Promise.all([noteRepo.findById(id), noteRepo.findTagsByNoteId(id)]);
  const result = await noteRepo.remove(id);

  if (result) {
    if (note) {
      const keys = extractAssetKeys(note.body);
      await Promise.all(keys.map((key) => storageProvider.delete(key)));
    }

    for (const tagName of tagNames) {
      await removeOrphanTag(tagRepo, tagName);
    }
  }

  return result;
}
