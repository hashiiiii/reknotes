import type { ITagRepository } from "../../domain/tag/tag-repository";
import type { IEmbeddingProvider } from "../port/embedding-provider";

// Loading the model and warming existing tags at startup avoids delaying the first suggestion.
export async function preloadTagCache(embeddingProvider: IEmbeddingProvider, tagRepo: ITagRepository): Promise<void> {
  const [, tags] = await Promise.all([embeddingProvider.load(), tagRepo.findAll()]);
  await embeddingProvider.buildTagCache(tags.map((t) => t.name));
}
