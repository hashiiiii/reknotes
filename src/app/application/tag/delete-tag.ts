import type { ITagRepository } from "../../domain/tag/tag-repository";

export async function deleteTag(tagRepo: ITagRepository, id: number): Promise<boolean> {
  return tagRepo.removeById(id);
}
