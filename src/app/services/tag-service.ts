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

export function clearNoteTags(noteId: number): void {
  const db = getDb();
  db.prepare("DELETE FROM note_tags WHERE note_id = ?").run(noteId);
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
