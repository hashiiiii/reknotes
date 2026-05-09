import type { Tag } from "./tag";

export interface ITagRepository {
  findOrCreateMany(names: string[]): Promise<Tag[]>;
  findByName(name: string): Promise<Tag | null>;
  linkManyToNote(noteId: number, tagIds: number[]): Promise<void>;
  unlinkAllByNoteId(noteId: number): Promise<void>;
  findAll(): Promise<Tag[]>;
  deleteIfOrphan(tagId: number): Promise<void>;
  deleteAll(): Promise<void>;
}
