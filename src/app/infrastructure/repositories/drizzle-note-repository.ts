import { desc, eq, ilike, lt, or, sql } from "drizzle-orm";
import type { Note, NoteWithSnippet } from "../../domain/note/note";
import type { INoteRepository } from "../../domain/note/note-repository";
import { db } from "../db";
import { notes, noteTags, tags } from "../db/schema";

const PAGE_SIZE = 20;

export class DrizzleNoteRepository implements INoteRepository {
  async create(title: string, body: string): Promise<Note> {
    const [note] = await db.insert(notes).values({ title, body }).returning();
    return note;
  }

  async findById(id: number): Promise<Note | null> {
    const [note] = await db.select().from(notes).where(eq(notes.id, id)).limit(1);
    return note ?? null;
  }

  async update(id: number, title: string, body: string): Promise<Note | null> {
    const [note] = await db
      .update(notes)
      .set({ title, body, updatedAt: Date.now() })
      .where(eq(notes.id, id))
      .returning();
    return note ?? null;
  }

  async remove(id: number): Promise<boolean> {
    const [result] = await db.delete(notes).where(eq(notes.id, id)).returning();
    return result != null;
  }

  async list(cursor?: number): Promise<{ notes: Note[]; hasMore: boolean; nextCursor?: number }> {
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

  async findTagsByNoteId(noteId: number): Promise<string[]> {
    const rows = await db
      .select({ name: tags.name })
      .from(tags)
      .innerJoin(noteTags, eq(tags.id, noteTags.tagId))
      .where(eq(noteTags.noteId, noteId));
    return rows.map((r) => r.name);
  }

  async findAllWithSnippet(): Promise<NoteWithSnippet[]> {
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

  async search(pattern: string): Promise<Note[]> {
    return db
      .select()
      .from(notes)
      .where(or(ilike(notes.title, pattern), ilike(notes.body, pattern)))
      .orderBy(desc(notes.createdAt))
      .limit(50);
  }

  async findAll(): Promise<Pick<Note, "id" | "title" | "body">[]> {
    return db.select({ id: notes.id, title: notes.title, body: notes.body }).from(notes).orderBy(notes.id);
  }
}
