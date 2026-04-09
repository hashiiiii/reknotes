import type { ITagRepository } from "../../domain/tag/tag-repository";
import { dotProduct } from "../../domain/tag/tag-suggestion";
import type { IEmbeddingProvider } from "../port/embedding-provider";

const TAG_MERGE_THRESHOLD = 0.85;
const MAX_CANDIDATES = 20;
const MAX_TAGS = 3;

/**
 * ノートの内容からタグを提案する。
 *
 * 1. tokenizer でテキストを分かち書きし、1-gram / 2-gram の候補を生成
 * 2. 各候補を embedding し、ノート全体との類似度でランク付け
 * 3. 既存タグに十分近い候補があれば既存タグ名に正規化する
 */
export async function suggestTags(
  embeddingProvider: IEmbeddingProvider,
  tagRepo: ITagRepository,
  title: string,
  body: string,
): Promise<string[]> {
  try {
    const text = `${title}\n${body}`.slice(0, 512);
    if (!text.trim()) return [];

    const noteEmbedding = await embeddingProvider.embedNote(text);

    // Step 1: tokenizer で分かち書き → N-gram 候補を生成
    const words = await embeddingProvider.tokenize(text);
    const freq = new Map<string, number>();

    for (const w of words) {
      if (w.length >= 2 && w.length <= 20) {
        freq.set(w, (freq.get(w) ?? 0) + 1);
      }
    }
    for (let i = 0; i < words.length - 1; i++) {
      const bigram = words[i] + words[i + 1];
      if (bigram.length >= 2 && bigram.length <= 20) {
        freq.set(bigram, (freq.get(bigram) ?? 0) + 1);
      }
    }

    // 頻度順で上位候補に絞る
    const topCandidates = [...freq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_CANDIDATES)
      .map(([name]) => name);

    if (topCandidates.length === 0) return [];

    // Step 2: 各候補を embedding し、ノート全体との類似度でランク付け
    const scored: { name: string; score: number }[] = [];
    for (const name of topCandidates) {
      const emb = await embeddingProvider.embedTag(name);
      scored.push({ name, score: dotProduct(noteEmbedding, emb) });
    }
    scored.sort((a, b) => b.score - a.score);
    const keywords = scored.slice(0, MAX_TAGS);

    // Step 3: 既存タグとの正規化
    const existingTags = await tagRepo.findAll();

    // 既存タグの embedding を一括取得してキャッシュに載せる
    await embeddingProvider.buildTagCache(existingTags.map((t) => t.name));

    const result: string[] = [];

    for (const kw of keywords) {
      const kwEmb = await embeddingProvider.embedTag(kw.name);
      let bestMatch: { name: string; score: number } | null = null;

      for (const tag of existingTags) {
        const tagEmb = await embeddingProvider.embedTag(tag.name);
        const score = dotProduct(kwEmb, tagEmb);
        if (!bestMatch || score > bestMatch.score) {
          bestMatch = { name: tag.name, score };
        }
      }

      if (bestMatch && bestMatch.score >= TAG_MERGE_THRESHOLD) {
        result.push(bestMatch.name);
      } else {
        result.push(kw.name);
      }
    }

    return [...new Set(result)];
  } catch (err) {
    console.error("Tag suggestion failed (falling back to no tags):", err);
    return [];
  }
}
