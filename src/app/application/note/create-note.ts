import { resolveTitle } from "../../domain/note/note";
import type { INoteRepository } from "../../domain/note/note-repository";

export async function createNote(noteRepo: INoteRepository, title: string, body: string) {
  const autoTitle = resolveTitle(title, body);
  return noteRepo.create(autoTitle, body);
}
