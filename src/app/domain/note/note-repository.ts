import type { Note } from "./note";

export type NoteCursor = Pick<Note, "pinned" | "id">;

export interface INoteRepository {
  create(title: string, body: string): Promise<Note>;
  findById(id: number): Promise<Note | null>;
  update(id: number, title: string, body: string): Promise<Note | null>;
  setPinned(id: number, pinned: boolean): Promise<boolean>;
  delete(id: number): Promise<boolean>;
  deleteAll(): Promise<void>;
  list(cursor?: NoteCursor): Promise<{ notes: Note[]; hasMore: boolean; nextCursor?: NoteCursor }>;
  findTagsByNoteId(noteId: number): Promise<string[]>;
  findTagsByNoteIds(noteIds: number[]): Promise<Map<number, string[]>>;
  searchByQuery(query: string): Promise<Note[]>;
}
