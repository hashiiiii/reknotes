import type { Note } from "./note";

export interface INoteRepository {
  create(title: string, body: string): Promise<Note>;
  findById(id: number): Promise<Note | null>;
  update(id: number, title: string, body: string): Promise<Note | null>;
  delete(id: number): Promise<boolean>;
  deleteAll(): Promise<void>;
  list(cursor?: number): Promise<{ notes: Note[]; hasMore: boolean; nextCursor?: number }>;
  findTagsByNoteId(noteId: number): Promise<string[]>;
  findTagsByNoteIds(noteIds: number[]): Promise<Map<number, string[]>>;
  searchByQuery(query: string): Promise<Note[]>;
}
