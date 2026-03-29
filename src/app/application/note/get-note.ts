import type { INoteRepository } from "../../domain/note/note-repository";

export async function getNote(noteRepo: INoteRepository, id: number) {
  return noteRepo.findById(id);
}
