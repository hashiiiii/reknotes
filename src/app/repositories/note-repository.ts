import { desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import { db } from "../db";
import { notes, noteTags, tags } from "../db/schema";

const PAGE_SIZE = 20;

export async function create(title: string, body: string) {
  const [note] = await db.insert(notes).values({ title, body }).returning();
  return note;
}

export async function findById(id: number) {
  const [note] = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
  return note ?? null;
}

export async function update(id: number, title: string, body: string) {
  const [note] = await db.update(notes).set({ title, body, updatedAt: Date.now() }).where(eq(notes.id, id)).returning();
  return note ?? null;
}

export async function remove(id: number) {
  const [result] = await db.delete(notes).where(eq(notes.id, id)).returning();
  return result != null;
}

export async function list(cursor?: number) {
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

  const rows = await query;
  const hasMore = rows.length > PAGE_SIZE;
  if (hasMore) rows.pop();

  return {
    notes: rows,
    hasMore,
    nextCursor: hasMore ? rows[rows.length - 1]?.id : undefined,
  };
}

export async function findTagsByNoteId(noteId: number) {
  const rows = await db
    .select({ name: tags.name })
    .from(tags)
    .innerJoin(noteTags, eq(tags.id, noteTags.tagId))
    .where(eq(noteTags.noteId, noteId));
  return rows.map((r) => r.name);
}

export async function findAllWithSnippet() {
  return db
    .select({
      id: notes.id,
      title: notes.title,
      createdAt: notes.createdAt,
      snippet: sql<string>`SUBSTR(${notes.body}, 1, 120)`,
      linkCount: sql<number>`(SELECT COUNT(*) FROM note_tags WHERE note_id = ${notes.id})`,
    })
    .from(notes);
}

export async function search(pattern: string) {
  return db
    .select()
    .from(notes)
    .where(or(ilike(notes.title, pattern), ilike(notes.body, pattern)))
    .orderBy(desc(notes.createdAt))
    .limit(50);
}

export async function findAll() {
  return db.select({ id: notes.id, title: notes.title, body: notes.body }).from(notes).orderBy(notes.id);
}
