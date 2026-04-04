import type { Note, NoteWithSnippet } from "./note";

export interface INoteRepository {
  create(title: string, body: string): Promise<Note>;
  findById(id: number): Promise<Note | null>;
  update(id: number, title: string, body: string): Promise<Note | null>;
  remove(id: number): Promise<boolean>;
  list(cursor?: number): Promise<{ notes: Note[]; hasMore: boolean; nextCursor?: number }>;
  findTagsByNoteId(noteId: number): Promise<string[]>;
  findTagsByNoteIds(noteIds: number[]): Promise<Map<number, string[]>>;
  findAllWithSnippet(): Promise<NoteWithSnippet[]>;
  search(pattern: string): Promise<Note[]>;
  findAll(): Promise<Pick<Note, "id" | "title" | "body">[]>;
}
