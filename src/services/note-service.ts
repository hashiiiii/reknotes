import { getDb } from "../db/connection";
import type { Note } from "../types";

const PAGE_SIZE = 20;

export function createNote(title: string, body: string): Note {
  const db = getDb();
  const autoTitle = title.trim() || body.slice(0, 30).trim();
  const stmt = db.prepare("INSERT INTO notes (title, body) VALUES (?, ?) RETURNING *");
  return stmt.get(autoTitle, body) as Note;
}

export function getNote(id: number): Note | null {
  const db = getDb();
  return db.prepare("SELECT * FROM notes WHERE id = ?").get(id) as Note | null;
}

export function updateNote(id: number, title: string, body: string): Note | null {
  const db = getDb();
  const autoTitle = title.trim() || body.slice(0, 30).trim();
  return db
    .prepare("UPDATE notes SET title = ?, body = ?, updated_at = datetime('now') WHERE id = ? RETURNING *")
    .get(autoTitle, body, id) as Note | null;
}

export function deleteNote(id: number): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM notes WHERE id = ?").run(id);
  return result.changes > 0;
}

export function listNotes(cursor?: number): { notes: Note[]; hasMore: boolean; nextCursor?: number } {
  const db = getDb();
  let notes: Note[];

  if (cursor) {
    notes = db
      .prepare("SELECT * FROM notes WHERE id < ? ORDER BY id DESC LIMIT ?")
      .all(cursor, PAGE_SIZE + 1) as Note[];
  } else {
    notes = db.prepare("SELECT * FROM notes ORDER BY id DESC LIMIT ?").all(PAGE_SIZE + 1) as Note[];
  }

  const hasMore = notes.length > PAGE_SIZE;
  if (hasMore) notes.pop();

  return {
    notes,
    hasMore,
    nextCursor: hasMore ? notes[notes.length - 1]?.id : undefined,
  };
}

export function getNoteTags(noteId: number): string[] {
  const db = getDb();
  const rows = db
    .prepare("SELECT t.name FROM tags t JOIN note_tags nt ON t.id = nt.tag_id WHERE nt.note_id = ?")
    .all(noteId) as { name: string }[];
  return rows.map((r) => r.name);
}

export function getLinkedNotes(noteId: number): Note[] {
  const db = getDb();
  return db
    .prepare("SELECT n.* FROM notes n JOIN note_links nl ON n.id = nl.target_id WHERE nl.source_id = ?")
    .all(noteId) as Note[];
}

export function getBacklinks(noteId: number): Note[] {
  const db = getDb();
  return db
    .prepare("SELECT n.* FROM notes n JOIN note_links nl ON n.id = nl.source_id WHERE nl.target_id = ?")
    .all(noteId) as Note[];
}

export function clearLinks(noteId: number): void {
  const db = getDb();
  db.prepare("DELETE FROM note_links WHERE source_id = ?").run(noteId);
}

export function addLink(sourceId: number, targetId: number): void {
  const db = getDb();
  db.prepare("INSERT OR IGNORE INTO note_links (source_id, target_id) VALUES (?, ?)").run(sourceId, targetId);
}
