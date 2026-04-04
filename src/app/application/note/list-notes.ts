import type { INoteRepository } from "../../domain/note/note-repository";

export async function listNotesWithTags(noteRepo: INoteRepository, cursor?: number) {
  const result = await noteRepo.list(cursor);
  const notesWithTags = await Promise.all(
    result.notes.map(async (n) => ({
      ...n,
      tags: await noteRepo.findTagsByNoteId(n.id),
    })),
  );
  return { ...result, notes: notesWithTags };
}
