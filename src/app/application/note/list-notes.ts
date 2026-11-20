import type { INoteRepository, NoteCursor } from "../../domain/note/note-repository";
import { isNoteProcessing } from "./is-note-processing";

export async function listNotesWithTags(noteRepo: INoteRepository, cursor?: NoteCursor) {
  const result = await noteRepo.list(cursor);
  const noteIds = result.notes.map((n) => n.id);
  const tagsMap = await noteRepo.findTagsByNoteIds(noteIds);
  const notesWithTags = result.notes.map((n) => ({
    ...n,
    processing: isNoteProcessing(n.id),
    tags: tagsMap.get(n.id) ?? [],
  }));
  return { ...result, notes: notesWithTags };
}
