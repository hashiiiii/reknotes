import type { ITagRepository } from "../../domain/tag/tag-repository";

export async function getAllTags(tagRepo: ITagRepository) {
  return tagRepo.findAllWithCount();
}
