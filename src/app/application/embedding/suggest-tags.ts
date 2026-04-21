import type { ITagRepository } from "../../domain/tag/tag-repository";
import { dotProduct } from "../../domain/tag/tag-suggestion";
import type { IEmbeddingProvider } from "../port/embedding-provider";

// --- 閾値 ---
// embedding モデルはテキスト同士の「意味的な近さ」を 0〜1 のスコアで返す。
// スコアの目安（embeddinggemma-300m での実測値）:
//   0.45+ : 強く関連（"TypeScript" vs TypeScriptの記事）
//   0.30  : やや関連（"素数" vs 素数の記事）
//   0.20  : ほぼ無関係（"React" vs 素数の記事）
//   0.10  : 完全に無関係（"料理" vs 素数の記事）
//
// 既存タグは「一度ユーザーが承認したタグ」なので、緩めの閾値で積極的に再利用する。
// 新規タグはテキストから自動抽出した単語なので、厳しめの閾値でノイズを弾く。
const EXISTING_TAG_THRESHOLD = 0.25;
const NEW_TAG_THRESHOLD = 0.35;

const MAX_TAGS = 3;

// --- MMR (Maximal Marginal Relevance) ---
// 単純にスコア上位3つを選ぶと「TypeScript」「TS」「型」のように似た意味のタグが並んでしまう。
// MMR は「ノートとの関連性」と「既に選んだタグとの違い」を天秤にかけて、多様な切り口のタグを選ぶ手法。
//
// 計算式: mmr(c) = λ × 関連性(c) − (1−λ) × 冗長性(c)
//   関連性 = そのタグ候補がノートにどれだけ関連するか（embedding 類似度）
//   冗長性 = 既に選んだタグの中で最も似ているものとの類似度
//
// λ=1.0 だと関連性だけで選ぶ（重複しやすい）。λ=0.0 だと多様性だけで選ぶ（関連性を無視）。
// 0.7 は「関連性を重視しつつ、似すぎるタグは避ける」バランス。
const MMR_LAMBDA = 0.7;

type Candidate = { name: string; embedding: Float32Array; score: number };

function mmrSelect(candidates: Candidate[], maxTags: number): Candidate[] {
  const selected: Candidate[] = [];
  const remaining = [...candidates];

  while (selected.length < maxTags && remaining.length > 0) {
    let bestIdx = -1;
    let bestScore = -Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const c = remaining[i];
      // 既に選んだタグとの最大類似度 = 冗長性のペナルティ
      let maxSim = 0;
      for (const s of selected) {
        const sim = dotProduct(c.embedding, s.embedding);
        if (sim > maxSim) maxSim = sim;
      }
      const mmrScore = MMR_LAMBDA * c.score - (1 - MMR_LAMBDA) * maxSim;
      if (mmrScore > bestScore) {
        bestScore = mmrScore;
        bestIdx = i;
      }
    }

    selected.push(remaining[bestIdx]);
    remaining.splice(bestIdx, 1);
  }

  return selected;
}

/**
 * ノートの内容からタグを提案する。
 *
 * 1. 既存タグをノートとの類似度でスコアリングし、関連するものを候補に入れる
 * 2. テキストから内容語(unigram)を抽出し、ノートとの類似度でスコアリング
 * 3. 全候補から MMR で多様性を確保しつつ上位を選択する
 */
export async function suggestTags(
  embeddingProvider: IEmbeddingProvider,
  tagRepo: ITagRepository,
  title: string,
  body: string,
): Promise<string[]> {
  const text = `${title}\n${body}`.slice(0, 512);
  if (!text.trim()) return [];

  // タイトルと全文の両方を embed し、候補のスコアは高い方を採用する。
  // embedding モデル（retrieval 用）は「短いクエリ vs 長い文書」の類似度に最適化されている。
  // 全文 embedding だけだと body の内容に引っ張られて、タイトルに書いた主題の語（例: 「素数」）が
  // 閾値未満に沈んでしまう。タイトル embedding との類似度も見ることで、
  // ユーザーが主題として書いた語を候補プールに入れられる。
  const noteEmbedding = await embeddingProvider.embedNote(text);
  const titleEmbedding = title.trim() ? await embeddingProvider.embedNote(title) : noteEmbedding;
  const score = (emb: Float32Array) => Math.max(dotProduct(noteEmbedding, emb), dotProduct(titleEmbedding, emb));

  const candidates: Candidate[] = [];

  // Step 1: 既存タグをスコアリング
  // 既存タグを「そのまま候補に入れる」ことで、タグの再利用が自然に起きる。
  // タグが蓄積されるほど「コンポーネント設計」のような複合語も直接マッチするようになる。
  const existingTags = await tagRepo.findAll();
  if (existingTags.length > 0) {
    await embeddingProvider.buildTagCache(existingTags.map((t) => t.name));
    for (const tag of existingTags) {
      const embedding = await embeddingProvider.embedTag(tag.name);
      const s = score(embedding);
      if (s >= EXISTING_TAG_THRESHOLD) {
        candidates.push({ name: tag.name, embedding, score: s });
      }
    }
  }

  // Step 2: テキストから内容語を抽出してスコアリング
  // Intl.Segmenter で分かち書きした単語のうち、2文字以上のものを候補にする。
  // 1文字の助詞（は、の、が...）は長さフィルタで除外され、
  // 2文字以上の機能語（した、ある...）は embedding スコアが低いので閾値で自然に落ちる。
  const words = await embeddingProvider.tokenize(text);
  const contentWords = [...new Set(words.filter((w) => w.length >= 2 && w.length <= 20))];
  const existingTagNames = new Set(existingTags.map((t) => t.name));

  for (const word of contentWords) {
    if (existingTagNames.has(word.toLowerCase())) continue;
    const embedding = await embeddingProvider.embedTag(word);
    const s = score(embedding);
    if (s >= NEW_TAG_THRESHOLD) {
      candidates.push({ name: word, embedding, score: s });
    }
  }

  if (candidates.length === 0) return [];

  // Step 3: MMR で多様性を確保しつつ上位を選択
  const selected = mmrSelect(candidates, MAX_TAGS);
  return selected.map((c) => c.name);
}
