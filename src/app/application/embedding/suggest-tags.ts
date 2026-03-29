import type { IEmbeddingService } from "../../domain/embedding/embedding-service";
import { dotProduct, extractKeywordsFromTitle, filterTagsByThreshold } from "../../domain/embedding/tag-suggestion";
import type { ITagRepository } from "../../domain/tag/tag-repository";

export async function suggestTags(
  embeddingService: IEmbeddingService,
  tagRepo: ITagRepository,
  title: string,
  body: string,
): Promise<string[]> {
  const text = `${title}\n${body}`.slice(0, 512);
  const noteEmbedding = await embeddingService.embedPassage(text);

  const tags = await tagRepo.findAllNames();
  if (tags.length === 0) return [];

  const tagScores: { name: string; score: number }[] = [];
  for (const tag of tags) {
    const tagEmb = await embeddingService.embedTag(tag.name);
    tagScores.push({ name: tag.name, score: dotProduct(noteEmbedding, tagEmb) });
  }

  const suggested = filterTagsByThreshold(tagScores);

  if (suggested.length === 0 && title.trim()) {
    const newTags = extractKeywordsFromTitle(title);
    for (const name of newTags) {
      await embeddingService.embedTag(name);
    }
    return newTags;
  }

  return suggested;
}
