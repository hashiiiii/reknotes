import { desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import type { Note } from "../../domain/note/note";
import type { INoteRepository, NoteCursor } from "../../domain/note/note-repository";
import type { DrizzleDb } from "../db";
import { notes, noteTags, tags } from "../db/schema";

const PAGE_SIZE = 50;
const SEARCH_LIMIT = 50;

export class DrizzleNoteRepository implements INoteRepository {
  constructor(private db: DrizzleDb) {}

  async create(title: string, body: string): Promise<Note> {
    const [note] = await this.db.insert(notes).values({ title, body }).returning();
    return note;
  }

  async findById(id: number): Promise<Note | null> {
    const [note] = await this.db.select().from(notes).where(eq(notes.id, id)).limit(1);
    return note ?? null;
  }

  async update(id: number, title: string, body: string): Promise<Note | null> {
    const [note] = await this.db
      .update(notes)
      .set({ title, body, updatedAt: Date.now() })
      .where(eq(notes.id, id))
      .returning();
    return note ?? null;
  }

  async setPinned(id: number, pinned: boolean): Promise<boolean> {
    const updated = await this.db.update(notes).set({ pinned }).where(eq(notes.id, id)).returning({ id: notes.id });
    return updated.length > 0;
  }

  async delete(id: number): Promise<boolean> {
    const [result] = await this.db.delete(notes).where(eq(notes.id, id)).returning();
    return result != null;
  }

  async deleteAll(): Promise<void> {
    // Foreign keys cascade to note_tags, but tags need separate deletion through their repository.
    await this.db.delete(notes);
  }

  async list(cursor?: NoteCursor) {
    // The ID alone cannot locate the boundary between pinned and unpinned notes.
    const rows = await this.db
      .select()
      .from(notes)
      .where(cursor && sql`(${notes.pinned}, ${notes.id}) < (${cursor.pinned}, ${cursor.id})`)
      .orderBy(desc(notes.pinned), desc(notes.id))
      .limit(PAGE_SIZE + 1);
    const hasMore = rows.length > PAGE_SIZE;
    if (hasMore) rows.pop();

    const last = rows.at(-1);
    return {
      notes: rows,
      hasMore,
      nextCursor: hasMore && last ? { pinned: last.pinned, id: last.id } : undefined,
    };
  }

  async findTagsByNoteId(noteId: number): Promise<string[]> {
    const rows = await this.db
      .select({ name: tags.name })
      .from(tags)
      .innerJoin(noteTags, eq(tags.id, noteTags.tagId))
      .where(eq(noteTags.noteId, noteId));
    return rows.map((r) => r.name);
  }

  async findTagsByNoteIds(noteIds: number[]): Promise<Map<number, string[]>> {
    if (noteIds.length === 0) return new Map();
    const rows = await this.db
      .select({ noteId: noteTags.noteId, name: tags.name })
      .from(tags)
      .innerJoin(noteTags, eq(tags.id, noteTags.tagId))
      .where(inArray(noteTags.noteId, noteIds));
    const map = new Map<number, string[]>();
    for (const row of rows) {
      const list = map.get(row.noteId) ?? [];
      list.push(row.name);
      map.set(row.noteId, list);
    }
    return map;
  }

  async searchByQuery(query: string): Promise<Note[]> {
    const pattern = `%${query}%`;
    return this.db
      .select()
      .from(notes)
      .where(or(ilike(notes.title, pattern), ilike(notes.body, pattern)))
      .orderBy(desc(notes.createdAt))
      .limit(SEARCH_LIMIT);
  }
}
