import * as noteRepo from "../repositories/note-repository";
import { suggestTags } from "./embedding-service";
import * as tagService from "./tag-service";

export async function createNote(title: string, body: string) {
  const autoTitle = title.trim() || body.slice(0, 30).trim();
  return noteRepo.create(autoTitle, body);
}

export async function createNoteWithTags(title: string, body: string) {
  const note = await createNote(title, body);
  const generatedTags = await suggestTags(title, body);
  if (generatedTags.length > 0) await tagService.addTagsToNote(note.id, generatedTags);
  const tags = await getNoteTags(note.id);
  return { note, tags };
}

export async function getNote(id: number) {
  return noteRepo.findById(id);
}

export async function updateNote(id: number, title: string, body: string) {
  const autoTitle = title.trim() || body.slice(0, 30).trim();
  return noteRepo.update(id, autoTitle, body);
}

export async function updateNoteWithTags(id: number, title: string, body: string) {
  const note = await updateNote(id, title, body);
  if (!note) return null;
  await tagService.clearNoteTags(id);
  const generatedTags = await suggestTags(title, body);
  if (generatedTags.length > 0) await tagService.addTagsToNote(id, generatedTags);
  return note;
}

export async function deleteNote(id: number) {
  // ノート削除前に紐付くタグ名を取得
  const tagNames = await noteRepo.findTagsByNoteId(id);

  // ノート削除（cascade で note_tags も削除される）
  const result = await noteRepo.remove(id);

  // 孤立したタグを削除
  if (result && tagNames.length > 0) {
    for (const tagName of tagNames) {
      await tagService.removeOrphanTag(tagName);
    }
  }

  return result;
}

export async function listNotes(cursor?: number) {
  return noteRepo.list(cursor);
}

export async function getNoteTags(noteId: number) {
  return noteRepo.findTagsByNoteId(noteId);
}

export async function listNotesWithTags(cursor?: number) {
  const result = await noteRepo.list(cursor);
  const notesWithTags = await Promise.all(
    result.notes.map(async (n) => ({
      ...n,
      tags: await getNoteTags(n.id),
    })),
  );
  return { ...result, notes: notesWithTags };
}
