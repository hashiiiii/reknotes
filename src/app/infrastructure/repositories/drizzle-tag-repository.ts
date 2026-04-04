import { eq, sql } from "drizzle-orm";
import type { Tag, TagWithCount } from "../../domain/tag/tag";
import type { ITagRepository } from "../../domain/tag/tag-repository";
import type { DrizzleDb } from "../db";
import { noteTags, tags } from "../db/schema";

export class DrizzleTagRepository implements ITagRepository {
  constructor(private db: DrizzleDb) {}

  async findOrCreate(name: string): Promise<Tag> {
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

  async findAllWithCount(): Promise<TagWithCount[]> {
    return this.db
      .select({
        id: tags.id,
        name: tags.name,
        count: sql<number>`COUNT(${noteTags.noteId})`,
      })
      .from(tags)
      .innerJoin(noteTags, eq(tags.id, noteTags.tagId))
      .groupBy(tags.id)
      .orderBy(sql`COUNT(${noteTags.noteId}) DESC`);
  }

  async findAllNames(): Promise<Tag[]> {
    return this.db.select({ id: tags.id, name: tags.name }).from(tags).orderBy(tags.name);
  }

  async deleteAllNoteTagLinks(): Promise<void> {
    await this.db.delete(noteTags);
  }

  async removeById(id: number): Promise<boolean> {
    const deleted = await this.db.delete(tags).where(eq(tags.id, id)).returning();
    return deleted.length > 0;
  }

  async removeOrphanTag(tagId: number): Promise<void> {
    const [exists] = await this.db.select().from(noteTags).where(eq(noteTags.tagId, tagId)).limit(1);
    if (!exists) {
      await this.db.delete(tags).where(eq(tags.id, tagId));
    }
  }
}
