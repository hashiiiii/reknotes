import { eq } from "drizzle-orm";
import type { Tag } from "../../domain/tag/tag";
import type { ITagRepository } from "../../domain/tag/tag-repository";
import type { DrizzleDb } from "../db";
import { noteTags, tags } from "../db/schema";

export class DrizzleTagRepository implements ITagRepository {
  constructor(private db: DrizzleDb) {}

  async findOrCreate(name: string): Promise<Tag> {
    // ON CONFLICT DO NOTHING + SELECT の2クエリ構成。
    // DO NOTHING は RETURNING で衝突行を返さないため、1クエリ化するには
    // DO UPDATE SET name = EXCLUDED.name（no-op update）が必要になるが、可読性を優先して2クエリを許容する。
    await this.db.insert(tags).values({ name }).onConflictDoNothing();
    const [tag] = await this.db.select().from(tags).where(eq(tags.name, name)).limit(1);
    if (!tag) throw new Error(`Failed to create tag: ${name}`);
    return tag;
  }

  async findByName(name: string): Promise<Tag | null> {
    const [tag] = await this.db.select().from(tags).where(eq(tags.name, name)).limit(1);
    return tag ?? null;
  }

  async linkToNote(noteId: number, tagId: number): Promise<void> {
    await this.db.insert(noteTags).values({ noteId, tagId }).onConflictDoNothing();
  }

  async clearByNoteId(noteId: number): Promise<void> {
    await this.db.delete(noteTags).where(eq(noteTags.noteId, noteId));
  }

  async findAll(): Promise<Tag[]> {
    return this.db.select().from(tags);
  }

  async removeOrphanTag(tagId: number): Promise<void> {
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
