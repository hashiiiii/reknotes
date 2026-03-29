import type { IEmbeddingService } from "../../domain/embedding/embedding-service";
import type { ITagRepository } from "../../domain/tag/tag-repository";

export async function buildTagCache(embeddingService: IEmbeddingService, tagRepo: ITagRepository): Promise<void> {
  const tags = await tagRepo.findAllNames();
  await embeddingService.buildTagCache(tags.map((t) => t.name));
}
