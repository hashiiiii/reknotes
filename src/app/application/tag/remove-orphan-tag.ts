import { normalizeTagName } from "../../domain/tag/tag";
import type { ITagRepository } from "../../domain/tag/tag-repository";

export async function removeOrphanTag(tagRepo: ITagRepository, tagName: string) {
  const name = normalizeTagName(tagName);
  const tag = await tagRepo.findByName(name);
  if (tag) {
    await tagRepo.removeOrphanTag(tag.id);
  }
}
