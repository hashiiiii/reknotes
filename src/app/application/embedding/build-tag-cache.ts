import type { ITagRepository } from "../../domain/tag/tag-repository";
import type { IEmbeddingProvider } from "../port/embedding-provider";

export async function buildTagCache(embeddingProvider: IEmbeddingProvider, tagRepo: ITagRepository): Promise<void> {
  const tags = await tagRepo.findAll();
  await embeddingProvider.buildTagCache(tags.map((t) => t.name));
}
