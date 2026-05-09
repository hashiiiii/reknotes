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
    // INSERT (ON CONFLICT DO NOTHING) と SELECT の2クエリ構成。
    // DO NOTHING は RETURNING で衝突行を返さないため、SELECT で再取得する必要がある。
    // 2クエリの間に他プロセスから DELETE されると SELECT が空になり呼び出し側のリンク漏れに繋がるため、
    // transaction で原子性を保証する。
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
