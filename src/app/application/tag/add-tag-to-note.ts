import { normalizeTagName } from "../../domain/tag/tag";
import type { ITagRepository } from "../../domain/tag/tag-repository";

export async function addTagToNote(tagRepo: ITagRepository, noteId: number, tagName: string) {
  const name = normalizeTagName(tagName);
  const tag = await tagRepo.findOrCreate(name);
  await tagRepo.linkToNote(noteId, tag.id);
  return tag;
}
