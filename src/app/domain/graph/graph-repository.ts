import type { NoteNode, NoteTagLink, TagNode } from "./graph";

export interface IGraphRepository {
  findAllNoteNodes(): Promise<NoteNode[]>;
  findAllTagNodes(): Promise<TagNode[]>;
  findAllLinks(): Promise<NoteTagLink[]>;
  findRelatedNotes(noteId: number): Promise<NoteNode[]>;
  findRelatedTags(noteId: number): Promise<TagNode[]>;
  findRelatedLinks(noteId: number): Promise<NoteTagLink[]>;
}
