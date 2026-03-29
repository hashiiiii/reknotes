import type { ITagRepository } from "../../domain/tag/tag-repository";
import { dotProduct, extractKeywordsFromTitle, filterTagsByThreshold } from "../../domain/tag/tag-suggestion";
import type { IEmbeddingProvider } from "../port/embedding-provider";

export async function suggestTags(
  embeddingProvider: IEmbeddingProvider,
  tagRepo: ITagRepository,
  title: string,
  body: string,
): Promise<string[]> {
  const text = `${title}\n${body}`.slice(0, 512);
  const noteEmbedding = await embeddingProvider.embedPassage(text);

  const tags = await tagRepo.findAllNames();
  if (tags.length === 0) return [];

  const tagScores: { name: string; score: number }[] = [];
  for (const tag of tags) {
    const tagEmb = await embeddingProvider.embedTag(tag.name);
    tagScores.push({ name: tag.name, score: dotProduct(noteEmbedding, tagEmb) });
  }

  const suggested = filterTagsByThreshold(tagScores);

  if (suggested.length === 0 && title.trim()) {
    const newTags = extractKeywordsFromTitle(title);
    for (const name of newTags) {
      await embeddingProvider.embedTag(name);
    }
    return newTags;
  }

  return suggested;
}
