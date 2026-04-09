import { desc, eq, ilike, inArray, lt, or } from "drizzle-orm";
import type { Note } from "../../domain/note/note";
import type { INoteRepository } from "../../domain/note/note-repository";
import type { DrizzleDb } from "../db";
import { notes, noteTags, tags } from "../db/schema";

const PAGE_SIZE = 20;
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

  async remove(id: number): Promise<boolean> {
    const [result] = await this.db.delete(notes).where(eq(notes.id, id)).returning();
    return result != null;
  }

  async list(cursor?: number): Promise<{ notes: Note[]; hasMore: boolean; nextCursor?: number }> {
    const base = this.db.select().from(notes);
    const filtered = cursor ? base.where(lt(notes.id, cursor)) : base;
    const rows = await filtered.orderBy(desc(notes.id)).limit(PAGE_SIZE + 1);
    const hasMore = rows.length > PAGE_SIZE;
    if (hasMore) rows.pop();

    return {
      notes: rows,
      hasMore,
      nextCursor: hasMore ? rows[rows.length - 1]?.id : undefined,
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

  async search(pattern: string): Promise<Note[]> {
    return this.db
      .select()
      .from(notes)
      .where(or(ilike(notes.title, pattern), ilike(notes.body, pattern)))
      .orderBy(desc(notes.createdAt))
      .limit(SEARCH_LIMIT);
  }

  async findAll(): Promise<Pick<Note, "id" | "title" | "body">[]> {
    return this.db.select({ id: notes.id, title: notes.title, body: notes.body }).from(notes).orderBy(notes.id);
  }
}
