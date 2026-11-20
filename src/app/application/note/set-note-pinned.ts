import type { INoteRepository } from "../../domain/note/note-repository";

export function setNotePinned(noteRepo: INoteRepository, id: number, pinned: boolean) {
  return noteRepo.setPinned(id, pinned);
}
