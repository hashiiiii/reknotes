import type { ITagRepository } from "../../domain/tag/tag-repository";

export async function deleteTag(tagRepo: ITagRepository, id: number) {
  await tagRepo.removeById(id);
}
