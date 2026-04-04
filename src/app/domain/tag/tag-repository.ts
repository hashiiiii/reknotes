import type { Tag, TagWithCount } from "./tag";

export interface ITagRepository {
  findOrCreate(name: string): Promise<Tag>;
  findByName(name: string): Promise<Tag | null>;
  linkToNote(noteId: number, tagId: number): Promise<void>;
  clearByNoteId(noteId: number): Promise<void>;
  findAllWithCount(): Promise<TagWithCount[]>;
  findAllNames(): Promise<Tag[]>;
  deleteAllNoteTagLinks(): Promise<void>;
  removeById(id: number): Promise<boolean>;
  removeOrphanTag(tagId: number): Promise<void>;
}
