import type { INoteRepository } from "../../domain/note/note-repository";

export async function listNotes(noteRepo: INoteRepository, cursor?: number) {
  return noteRepo.list(cursor);
}

export async function listNotesWithTags(noteRepo: INoteRepository, cursor?: number) {
  const result = await noteRepo.list(cursor);
  const noteIds = result.notes.map((n) => n.id);
  const tagsMap = await noteRepo.findTagsByNoteIds(noteIds);
  const notesWithTags = result.notes.map((n) => ({
    ...n,
    tags: tagsMap.get(n.id) ?? [],
  }));
  return { ...result, notes: notesWithTags };
}
