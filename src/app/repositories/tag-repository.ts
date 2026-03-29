import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { noteTags, tags } from "../db/schema";

export async function findOrCreate(name: string) {
  await db.insert(tags).values({ name }).onConflictDoNothing();
  const [tag] = await db.select().from(tags).where(eq(tags.name, name)).limit(1);
  if (!tag) throw new Error(`Failed to create tag: ${name}`);
  return tag;
}

export async function findByName(name: string) {
  const [tag] = await db.select().from(tags).where(eq(tags.name, name)).limit(1);
  return tag ?? null;
}

export async function linkToNote(noteId: number, tagId: number) {
  await db.insert(noteTags).values({ noteId, tagId }).onConflictDoNothing();
}

export async function clearByNoteId(noteId: number) {
  await db.delete(noteTags).where(eq(noteTags.noteId, noteId));
}

export async function findAllWithCount() {
  return db
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

export async function findAllNames() {
  return db.select({ id: tags.id, name: tags.name }).from(tags).orderBy(tags.name);
}

export async function deleteAllNoteTagLinks() {
  await db.delete(noteTags);
}

export async function removeById(id: number) {
  await db.delete(tags).where(eq(tags.id, id));
}

export async function removeOrphanTag(tagId: number) {
  const [exists] = await db.select().from(noteTags).where(eq(noteTags.tagId, tagId)).limit(1);
  if (!exists) {
    await db.delete(tags).where(eq(tags.id, tagId));
  }
}
