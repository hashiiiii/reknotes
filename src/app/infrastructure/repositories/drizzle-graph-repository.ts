import { eq, sql } from "drizzle-orm";
import type { NoteNode, NoteTagLink, TagNode } from "../../domain/graph/graph";
import type { IGraphRepository } from "../../domain/graph/graph-repository";
import { db } from "../db";
import { notes, noteTags, tags } from "../db/schema";

export class DrizzleGraphRepository implements IGraphRepository {
  async findAllNoteNodes(): Promise<NoteNode[]> {
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

  async findAllTagNodes(): Promise<TagNode[]> {
    return db
      .select({
        id: tags.id,
        name: tags.name,
        noteCount: sql<number>`COUNT(${noteTags.noteId})`,
      })
      .from(tags)
      .innerJoin(noteTags, eq(tags.id, noteTags.tagId))
      .groupBy(tags.id);
  }

  async findAllLinks(): Promise<NoteTagLink[]> {
    return db.select().from(noteTags);
  }

  async findRelatedNotes(noteId: number): Promise<NoteNode[]> {
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
      .groupBy(notes.id);
  }

  async findRelatedTags(noteId: number): Promise<TagNode[]> {
    return db
      .select({
        id: tags.id,
        name: tags.name,
        noteCount: sql<number>`COUNT(${noteTags.noteId})`,
      })
      .from(tags)
      .innerJoin(noteTags, eq(tags.id, noteTags.tagId))
      .where(sql`${tags.id} IN (SELECT tag_id FROM note_tags WHERE note_id = ${noteId})`)
      .groupBy(tags.id);
  }

  async findRelatedLinks(noteId: number): Promise<NoteTagLink[]> {
    return db
      .select()
      .from(noteTags)
      .where(sql`${noteTags.tagId} IN (SELECT tag_id FROM note_tags WHERE note_id = ${noteId})`);
  }
}
