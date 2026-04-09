import { eq, sql } from "drizzle-orm";
import type { NoteNode, NoteTagLink, TagNode } from "../../domain/graph/graph";
import type { IGraphRepository } from "../../domain/graph/graph-repository";
import type { DrizzleDb } from "../db";
import { notes, noteTags, tags } from "../db/schema";
import { SNIPPET_LENGTH } from "./constants";

export class DrizzleGraphRepository implements IGraphRepository {
  constructor(private db: DrizzleDb) {}

  async findAllNoteNodes(): Promise<NoteNode[]> {
    return this.db
      .select({
        id: notes.id,
        title: notes.title,
        createdAt: notes.createdAt,
        snippet: sql<string>`SUBSTR(${notes.body}, 1, ${SNIPPET_LENGTH})`,
        linkCount: sql<number>`(SELECT COUNT(*) FROM note_tags WHERE note_id = ${notes.id})`,
      })
      .from(notes);
  }

  async findAllTagNodes(): Promise<TagNode[]> {
    return this.db
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
    return this.db.select().from(noteTags);
  }

  async findNoteNodeById(noteId: number): Promise<NoteNode | null> {
    const [row] = await this.db
      .select({
        id: notes.id,
        title: notes.title,
        createdAt: notes.createdAt,
        snippet: sql<string>`SUBSTR(${notes.body}, 1, ${SNIPPET_LENGTH})`,
        linkCount: sql<number>`(SELECT COUNT(*) FROM note_tags WHERE note_id = ${notes.id})`,
      })
      .from(notes)
      .where(eq(notes.id, noteId))
      .limit(1);
    return row ?? null;
  }

  async findRelatedNotes(noteId: number): Promise<NoteNode[]> {
    return this.db
      .select({
        id: notes.id,
        title: notes.title,
        createdAt: notes.createdAt,
        snippet: sql<string>`SUBSTR(${notes.body}, 1, ${SNIPPET_LENGTH})`,
        linkCount: sql<number>`(SELECT COUNT(*) FROM note_tags WHERE note_id = ${notes.id})`,
      })
      .from(notes)
      .innerJoin(noteTags, eq(notes.id, noteTags.noteId))
      .where(sql`${noteTags.tagId} IN (SELECT tag_id FROM note_tags WHERE note_id = ${noteId})`)
      .groupBy(notes.id);
  }

  async findRelatedTags(noteId: number): Promise<TagNode[]> {
    return this.db
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
    return this.db
      .select()
      .from(noteTags)
      .where(sql`${noteTags.tagId} IN (SELECT tag_id FROM note_tags WHERE note_id = ${noteId})`);
  }
}
