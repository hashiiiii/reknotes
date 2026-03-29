import type { ITagRepository } from "../../domain/tag/tag-repository";

export async function clearNoteTags(tagRepo: ITagRepository, noteId: number) {
  await tagRepo.clearByNoteId(noteId);
}
