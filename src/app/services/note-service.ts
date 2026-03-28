import * as noteRepo from "../repositories/note-repository";
import { suggestTags } from "./embedding-service";
import * as tagService from "./tag-service";

export function createNote(title: string, body: string) {
  const autoTitle = title.trim() || body.slice(0, 30).trim();
  return noteRepo.create(autoTitle, body);
}

export async function createNoteWithTags(title: string, body: string) {
  const note = createNote(title, body);
  const generatedTags = await suggestTags(title, body);
  if (generatedTags.length > 0) tagService.addTagsToNote(note.id, generatedTags);
  const tags = getNoteTags(note.id);
  return { note, tags };
}

export function getNote(id: number) {
  return noteRepo.findById(id);
}

export function updateNote(id: number, title: string, body: string) {
  const autoTitle = title.trim() || body.slice(0, 30).trim();
  return noteRepo.update(id, autoTitle, body);
}

export async function updateNoteWithTags(id: number, title: string, body: string) {
  const note = updateNote(id, title, body);
  if (!note) return null;
  tagService.clearNoteTags(id);
  const generatedTags = await suggestTags(title, body);
  if (generatedTags.length > 0) tagService.addTagsToNote(id, generatedTags);
  return note;
}

export function deleteNote(id: number) {
  // ノート削除前に紐付くタグ名を取得
  const tagNames = noteRepo.findTagsByNoteId(id);

  // ノート削除（cascade で note_tags も削除される）
  const result = noteRepo.remove(id);

  // 孤立したタグを削除
  if (result && tagNames.length > 0) {
    for (const tagName of tagNames) {
      tagService.removeOrphanTag(tagName);
    }
  }

  return result;
}

export function listNotes(cursor?: number) {
  return noteRepo.list(cursor);
}

export function getNoteTags(noteId: number) {
  return noteRepo.findTagsByNoteId(noteId);
}

export function listNotesWithTags(cursor?: number) {
  const result = noteRepo.list(cursor);
  const notes = result.notes.map((n) => ({
    ...n,
    tags: getNoteTags(n.id),
  }));
  return { ...result, notes };
}
