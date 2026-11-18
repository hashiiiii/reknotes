import type { INoteRepository } from "../../domain/note/note-repository";
import type { ITagRepository } from "../../domain/tag/tag-repository";

// Cascading note deletion removes links but leaves tags, so both repositories are needed.
// This seed/reset operation accepts orphan tags after a partial failure; rerunning removes them.
export async function clearAllNotesAndTags(noteRepo: INoteRepository, tagRepo: ITagRepository): Promise<void> {
  await noteRepo.deleteAll();
  await tagRepo.deleteAll();
}
