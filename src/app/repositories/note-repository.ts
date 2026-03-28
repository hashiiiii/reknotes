import { desc, eq, lt, sql } from "drizzle-orm";
import { db } from "../db";
import { notes, noteTags, tags } from "../db/schema";

const PAGE_SIZE = 20;

export function create(title: string, body: string) {
  return db.insert(notes).values({ title, body }).returning().get();
}

export function findById(id: number) {
  return db.select().from(notes).where(eq(notes.id, id)).get() ?? null;
}

export function update(id: number, title: string, body: string) {
  return (
    db.update(notes).set({ title, body, updatedAt: sql`datetime('now')` }).where(eq(notes.id, id)).returning().get() ??
    null
  );
}

export function remove(id: number) {
  const result = db.delete(notes).where(eq(notes.id, id)).returning().get();
  return result != null;
}

export function list(cursor?: number) {
  const query = cursor
    ? db
        .select()
        .from(notes)
        .where(lt(notes.id, cursor))
        .orderBy(desc(notes.id))
        .limit(PAGE_SIZE + 1)
    : db
        .select()
        .from(notes)
        .orderBy(desc(notes.id))
        .limit(PAGE_SIZE + 1);

  const rows = query.all();
  const hasMore = rows.length > PAGE_SIZE;
  if (hasMore) rows.pop();

  return {
    notes: rows,
    hasMore,
    nextCursor: hasMore ? rows[rows.length - 1]?.id : undefined,
  };
}

export function findTagsByNoteId(noteId: number) {
  const rows = db
    .select({ name: tags.name })
    .from(tags)
    .innerJoin(noteTags, eq(tags.id, noteTags.tagId))
    .where(eq(noteTags.noteId, noteId))
    .all();
  return rows.map((r) => r.name);
}

export function findAllWithSnippet() {
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

export function search(pattern: string) {
  return db
    .select()
    .from(notes)
    .where(sql`${notes.title} LIKE ${pattern} OR ${notes.body} LIKE ${pattern}`)
    .orderBy(desc(notes.createdAt))
    .limit(50)
    .all();
}

export function findAll() {
  return db.select({ id: notes.id, title: notes.title, body: notes.body }).from(notes).orderBy(notes.id).all();
}
