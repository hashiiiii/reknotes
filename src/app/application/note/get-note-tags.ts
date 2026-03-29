import type { INoteRepository } from "../../domain/note/note-repository";

export async function getNoteTags(noteRepo: INoteRepository, noteId: number) {
  return noteRepo.findTagsByNoteId(noteId);
}
