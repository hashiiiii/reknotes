import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { noteTags, tags } from "../db/schema";

export function findOrCreate(name: string) {
  db.insert(tags).values({ name }).onConflictDoNothing().run();
  const tag = db.select().from(tags).where(eq(tags.name, name)).get();
  if (!tag) throw new Error(`Failed to create tag: ${name}`);
  return tag;
}

export function findByName(name: string) {
  return db.select().from(tags).where(eq(tags.name, name)).get() ?? null;
}

export function linkToNote(noteId: number, tagId: number) {
  db.insert(noteTags).values({ noteId, tagId }).onConflictDoNothing().run();
}

export function clearByNoteId(noteId: number) {
  db.delete(noteTags).where(eq(noteTags.noteId, noteId)).run();
}

export function findAllWithCount() {
  return db
    .select({
      id: tags.id,
      name: tags.name,
      count: sql<number>`COUNT(${noteTags.noteId})`,
    })
    .from(tags)
    .innerJoin(noteTags, eq(tags.id, noteTags.tagId))
    .groupBy(tags.id)
    .orderBy(sql`COUNT(${noteTags.noteId}) DESC`)
    .all();
}

export function findAllNames() {
  return db.select({ id: tags.id, name: tags.name }).from(tags).orderBy(tags.name).all();
}

export function deleteAllNoteTagLinks() {
  db.delete(noteTags).run();
}

export function removeById(id: number) {
  db.delete(tags).where(eq(tags.id, id)).run();
}

export function removeOrphanTag(tagId: number) {
  // このタグが他のノートで使われていなければ削除
  const exists = db.select().from(noteTags).where(eq(noteTags.tagId, tagId)).get();
  if (!exists) {
    db.delete(tags).where(eq(tags.id, tagId)).run();
  }
}
