import { eq, inArray } from "drizzle-orm";
import type { Tag } from "../../domain/tag/tag";
import type { ITagRepository } from "../../domain/tag/tag-repository";
import type { DrizzleDb } from "../db";
import { noteTags, tags } from "../db/schema";

export class DrizzleTagRepository implements ITagRepository {
  constructor(private db: DrizzleDb) {}

  async findOrCreateMany(names: string[]): Promise<Tag[]> {
    const unique = Array.from(new Set(names));
    if (unique.length === 0) return [];
    // ON CONFLICT DO NOTHING omits existing rows from RETURNING, so a follow-up
    // SELECT is needed to retrieve both existing and newly inserted tags.
    return this.db.transaction(async (tx) => {
      await tx
        .insert(tags)
        .values(unique.map((name) => ({ name })))
        .onConflictDoNothing();
      return tx.select().from(tags).where(inArray(tags.name, unique));
    });
  }

  async findByName(name: string): Promise<Tag | null> {
    const [tag] = await this.db.select().from(tags).where(eq(tags.name, name)).limit(1);
    return tag ?? null;
  }

  async linkManyToNote(noteId: number, tagIds: number[]): Promise<void> {
    if (tagIds.length === 0) return;
    await this.db
      .insert(noteTags)
      .values(tagIds.map((tagId) => ({ noteId, tagId })))
      .onConflictDoNothing();
  }

  async unlinkAllByNoteId(noteId: number): Promise<void> {
    await this.db.delete(noteTags).where(eq(noteTags.noteId, noteId));
  }

  async findAll(): Promise<Tag[]> {
    return this.db.select().from(tags);
  }

  async deleteIfOrphan(tagId: number): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [exists] = await tx.select().from(noteTags).where(eq(noteTags.tagId, tagId)).limit(1);
      if (!exists) {
        await tx.delete(tags).where(eq(tags.id, tagId));
      }
    });
  }

  async deleteAll(): Promise<void> {
    await this.db.delete(tags);
  }
}
