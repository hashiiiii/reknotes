import type { Tag } from "./tag";

export interface ITagRepository {
  findOrCreate(name: string): Promise<Tag>;
  findByName(name: string): Promise<Tag | null>;
  linkToNote(noteId: number, tagId: number): Promise<void>;
  clearByNoteId(noteId: number): Promise<void>;
  findAll(): Promise<Tag[]>;
  deleteAllNoteTagLinks(): Promise<void>;
  removeOrphanTag(tagId: number): Promise<void>;
}
