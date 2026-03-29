import type { ITagRepository } from "../../domain/tag/tag-repository";
import { addTagToNote } from "./add-tag-to-note";

export async function addTagsToNote(tagRepo: ITagRepository, noteId: number, tagNames: string[]) {
  for (const name of tagNames) {
    if (name.trim()) await addTagToNote(tagRepo, noteId, name);
  }
}
