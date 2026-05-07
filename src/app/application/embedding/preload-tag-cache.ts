import type { ITagRepository } from "../../domain/tag/tag-repository";
import type { IEmbeddingProvider } from "../port/embedding-provider";

// embedding モデルのロード (起動時の一度きり) と既存タグ全件のベクトルキャッシュ構築を並列で走らせる。
// 起動直後の最初のタグ提案リクエストでこれらが直列に走るとレスポンスが遅延するので、サーバー起動時に先食いする。
export async function preloadTagCache(embeddingProvider: IEmbeddingProvider, tagRepo: ITagRepository): Promise<void> {
  const [, tags] = await Promise.all([embeddingProvider.load(), tagRepo.findAll()]);
  await embeddingProvider.buildTagCache(tags.map((t) => t.name));
}
