import { resolveDownloadFilename } from "../../domain/note/note";
import type { INoteRepository } from "../../domain/note/note-repository";
import { getNote } from "./get-note";

export interface NoteDownload {
  filename: string;
  body: string;
}

export async function downloadNote(noteRepository: INoteRepository, id: number): Promise<NoteDownload | null> {
  const note = await getNote(noteRepository, id);
  if (!note) return null;
  return { filename: resolveDownloadFilename(note), body: note.body };
}
