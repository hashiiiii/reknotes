import type { Tag } from "./tag";

export interface ITagRepository {
  findOrCreate(name: string): Promise<Tag>;
  findByName(name: string): Promise<Tag | null>;
  linkToNote(noteId: number, tagId: number): Promise<void>;
  unlinkAllByNoteId(noteId: number): Promise<void>;
  findAll(): Promise<Tag[]>;
  deleteIfOrphan(tagId: number): Promise<void>;
  deleteAll(): Promise<void>;
}
