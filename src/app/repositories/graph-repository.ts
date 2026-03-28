import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { notes, noteTags, tags } from "../db/schema";

export function findAllNoteNodes() {
  return db
    .select({
      id: notes.id,
      title: notes.title,
      createdAt: notes.createdAt,
      snippet: sql<string>`SUBSTR(${notes.body}, 1, 120)`,
      linkCount: sql<number>`(SELECT COUNT(*) FROM note_tags WHERE note_id = ${notes.id})`,
    })
    .from(notes)
    .all();
}

export function findAllTagNodes() {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      noteCount: sql<number>`COUNT(${noteTags.noteId})`,
    })
    .from(tags)
    .innerJoin(noteTags, eq(tags.id, noteTags.tagId))
    .groupBy(tags.id)
    .all();
}

export function findAllLinks() {
  return db.select().from(noteTags).all();
}

export function findRelatedNotes(noteId: number) {
  return db
    .select({
      id: notes.id,
      title: notes.title,
      createdAt: notes.createdAt,
      snippet: sql<string>`SUBSTR(${notes.body}, 1, 120)`,
      linkCount: sql<number>`(SELECT COUNT(*) FROM note_tags WHERE note_id = ${notes.id})`,
    })
    .from(notes)
    .innerJoin(noteTags, eq(notes.id, noteTags.noteId))
    .where(sql`${noteTags.tagId} IN (SELECT tag_id FROM note_tags WHERE note_id = ${noteId})`)
    .groupBy(notes.id)
    .all();
}

export function findRelatedTags(noteId: number) {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      noteCount: sql<number>`COUNT(${noteTags.noteId})`,
    })
    .from(tags)
    .innerJoin(noteTags, eq(tags.id, noteTags.tagId))
    .where(sql`${tags.id} IN (SELECT tag_id FROM note_tags WHERE note_id = ${noteId})`)
    .groupBy(tags.id)
    .all();
}

export function findRelatedLinks(noteId: number) {
  return db
    .select()
    .from(noteTags)
    .where(sql`${noteTags.tagId} IN (SELECT tag_id FROM note_tags WHERE note_id = ${noteId})`)
    .all();
}
