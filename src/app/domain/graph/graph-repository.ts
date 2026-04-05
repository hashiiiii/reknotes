import type { NoteWithSnippet } from "../note/note";
import type { NoteTagLink, TagNode } from "./graph";

export interface IGraphRepository {
  findAllNoteNodes(): Promise<NoteWithSnippet[]>;
  findAllTagNodes(): Promise<TagNode[]>;
  findAllLinks(): Promise<NoteTagLink[]>;
  findNoteNodeById(noteId: number): Promise<NoteWithSnippet | null>;
  findRelatedNotes(noteId: number): Promise<NoteWithSnippet[]>;
  findRelatedTags(noteId: number): Promise<TagNode[]>;
  findRelatedLinks(noteId: number): Promise<NoteTagLink[]>;
}
