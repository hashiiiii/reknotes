import { resolveTitle } from "../../domain/note/note";
import type { INoteRepository } from "../../domain/note/note-repository";

export async function updateNote(noteRepo: INoteRepository, id: number, title: string, body: string) {
  const autoTitle = resolveTitle(title, body);
  return noteRepo.update(id, autoTitle, body);
}
