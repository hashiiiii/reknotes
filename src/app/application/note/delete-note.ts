import type { INoteRepository } from "../../domain/note/note-repository";
import type { ITagRepository } from "../../domain/tag/tag-repository";
import { removeOrphanTag } from "../tag/remove-orphan-tag";

export async function deleteNote(noteRepo: INoteRepository, tagRepo: ITagRepository, id: number) {
  const tagNames = await noteRepo.findTagsByNoteId(id);
  const result = await noteRepo.remove(id);

  if (result && tagNames.length > 0) {
    for (const tagName of tagNames) {
      await removeOrphanTag(tagRepo, tagName);
    }
  }

  return result;
}
