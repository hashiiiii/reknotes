import { sql } from "drizzle-orm";
import { bigint, index, integer, pgTable, primaryKey, serial, text } from "drizzle-orm/pg-core";

export const notes = pgTable(
  "notes",
  {
    id: serial("id").primaryKey(),
    title: text("title").notNull().default(""),
    body: text("body").notNull(),
    createdAt: bigint("created_at", { mode: "number" })
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: bigint("updated_at", { mode: "number" })
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (table) => [index("idx_notes_created_at").on(table.createdAt)],
);

export const tags = pgTable("tags", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
});

export const noteTags = pgTable(
  "note_tags",
  {
    noteId: integer("note_id")
      .notNull()
      .references(() => notes.id, { onDelete: "cascade" }),
    tagId: integer("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.noteId, table.tagId] }), index("idx_note_tags_tag_id").on(table.tagId)],
);

// ── 共通 SQL フラグメント ──
export const noteSnippet = sql<string>`SUBSTR(${notes.body}, 1, 120)`;
export const noteLinkCount = sql<number>`(SELECT COUNT(*) FROM note_tags WHERE note_id = ${notes.id})`;
