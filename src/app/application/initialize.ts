import type { ITagRepository } from "../domain/tag/tag-repository";
import type { IEmbeddingProvider } from "./port/embedding-provider";

export async function initialize(embeddingProvider: IEmbeddingProvider, tagRepository: ITagRepository): Promise<void> {
  const [, tags] = await Promise.all([embeddingProvider.load(), tagRepository.findAll()]);
  await embeddingProvider.buildTagCache(tags.map((t) => t.name));
}
