import { getDb } from "../db/connection";
import type { Tag } from "../types";

export function addTagToNote(noteId: number, tagName: string): Tag {
  const db = getDb();
  const name = tagName.trim().toLowerCase();

  // タグが無ければ作成
  db.prepare("INSERT OR IGNORE INTO tags (name) VALUES (?)").run(name);
  const tag = db.prepare("SELECT * FROM tags WHERE name = ?").get(name) as Tag;

  // ノートに紐付け
  db.prepare("INSERT OR IGNORE INTO note_tags (note_id, tag_id) VALUES (?, ?)").run(noteId, tag.id);

  return tag;
}

export function addTagsToNote(noteId: number, tagNames: string[]): void {
  for (const name of tagNames) {
    if (name.trim()) addTagToNote(noteId, name);
  }
}

export function removeTagFromNote(noteId: number, tagId: number): void {
  const db = getDb();
  db.prepare("DELETE FROM note_tags WHERE note_id = ? AND tag_id = ?").run(noteId, tagId);

  // 孤立タグを削除
  db.prepare("DELETE FROM tags WHERE id = ? AND NOT EXISTS (SELECT 1 FROM note_tags WHERE tag_id = ?)").run(
    tagId,
    tagId,
  );
}

export function clearNoteTags(noteId: number): void {
  const db = getDb();
  db.prepare("DELETE FROM note_tags WHERE note_id = ?").run(noteId);
  // 孤立タグを一括削除
  db.prepare("DELETE FROM tags WHERE NOT EXISTS (SELECT 1 FROM note_tags WHERE tag_id = tags.id)").run();
}

export function getAllTags(): (Tag & { count: number })[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT t.*, COUNT(nt.note_id) as count
       FROM tags t
       JOIN note_tags nt ON t.id = nt.tag_id
       GROUP BY t.id
       ORDER BY count DESC`,
    )
    .all() as (Tag & { count: number })[];
}

export function getNotesByTag(tagName: string): number[] {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT nt.note_id FROM note_tags nt
       JOIN tags t ON t.id = nt.tag_id
       WHERE t.name = ?`,
    )
    .all(tagName) as { note_id: number }[];
  return rows.map((r) => r.note_id);
}
