import type { ITagRepository } from "../../domain/tag/tag-repository";
import { dotProduct } from "../../domain/tag/tag-suggestion";
import type { IEmbeddingProvider } from "../port/embedding-provider";

const MAX_TAGS = 3;

// --- 相対閾値 ---
// 全候補のうち最高スコアの SCORE_CUTOFF_RATIO 未満のものを除外する。
// 固定閾値（例: 0.30）だとモデルや量子化方式によってスコアの絶対値が変わるため、
// ローカル ONNX と Cloudflare Workers AI のようにモデル実装が異なる環境間で
// 閾値のチューニン��が二重に必要になってしまう。
// 相対閾値ならスコアのスケールに自動追従するため、モデルが変わっても調整不要。
//
// 0.5 = 最高スコアの半分未満を除外。実測で:
//   - 関連語は最高スコアの 60〜100% に分布
//   - 無関係な既存タグは最高スコアの 30〜45% に分布
//   - 機能語（した、ある等）は最高スコアの 20〜40% に分布
// 0.5 はこれらの間にあり、関連語を残しつつノイズを弾くバランス。
const SCORE_CUTOFF_RATIO = 0.5;

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

// --- 漢字判定 ---
// バイグラム生成で1文字漢字（接辞）を識別するために使う。
// CJK統合漢字（U+4E00–U+9FFF）と拡張A（U+3400–U+4DBF）をカバー。
function isKanji(char: string): boolean {
  const code = char.codePointAt(0);
  if (code === undefined) return false;
  return (code >= 0x4e00 && code <= 0x9fff) || (code >= 0x3400 && code <= 0x4dbf);
}

// --- コードブロック除去 ---
// 候補語抽出の前にトリプルバッククォート（```）で囲まれたコードブロックを除去する。
// コードブロック内の数式・変数名（4x, ax^4, value 等）がノイズ候補になるのを防ぐ。
// ノート embedding には全文を使い、候補語の抽出だけコードブロックを除く。
//
// 正規表現の解説:
//   ```        → 開始のトリプルバッククォートにマッチ
//   [\s\S]*?   → 改行を含む任意の文字列に非貪欲（最短）マッチ
//                （ . は改行にマッチしないため [\s\S] を使う）
//   ```        → 終了のトリプルバッククォートにマッチ
//   /g         → テキスト中の全コードブロックを対象にする
function stripCodeBlocks(text: string): string {
  return text.replace(/```[\s\S]*?```/g, " ");
}

// --- 候補語抽出 ---
// テキストから unigram（単語）と bigram（複合語）のタグ候補を抽出する。
//
// unigram: Intl.Segmenter で分かち書きした単語のうち 2〜20 文字のもの。
//   1文字の助詞（は、の、が...）は長さフィルタで除外され、
//   2文字以上の機能語（した、ある...）は embedding スコアが低いので相対閾値で自然に落ちる。
//
// bigram: 原文で直接隣接する2つの word-like セグメントを結合する。ただし条件あり:
//   - 片方が1文字の漢字（接辞: 法、式、型、量、化 等）であること
//   - もう片方が2文字以上であること
//   これにより「ホーナー＋法→ホーナー法」「計算＋量→計算量」を復元しつつ、
//   ひらがな助詞との誤結合（「法＋の→法の」等）を防ぐ。
function extractCandidateWords(text: string): string[] {
  const segmenter = new Intl.Segmenter("ja", { granularity: "word" });
  const allSegments = [...segmenter.segment(text)];

  const candidates = new Set<string>();

  for (const seg of allSegments) {
    if (seg.isWordLike && seg.segment.length >= 2 && seg.segment.length <= 20) {
      candidates.add(seg.segment);
    }
  }

  for (let i = 0; i < allSegments.length - 1; i++) {
    if (!allSegments[i].isWordLike || !allSegments[i + 1].isWordLike) continue;

    const left = allSegments[i].segment;
    const right = allSegments[i + 1].segment;

    const leftIsOneCharKanji = left.length === 1 && isKanji(left);
    const rightIsOneCharKanji = right.length === 1 && isKanji(right);

    // 1文字漢字接辞 + 2文字以上の内容語、またはその逆の並びのみ結合する
    const shouldJoin = (leftIsOneCharKanji && right.length >= 2) || (rightIsOneCharKanji && left.length >= 2);
    if (!shouldJoin) continue;

    const compound = left + right;
    if (compound.length >= 2 && compound.length <= 20) {
      candidates.add(compound);
    }
  }

  return [...candidates];
}

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
 * 1. 既存タグをノートとの類似度でスコアリングし、候補プールに入れる
 * 2. テキストから内容語(unigram + 1文字漢字バイグラム)を抽出し、ノートとの類似度でスコアリング
 * 3. 全候補を相対閾値でフィルタし、MMR で多様性を確保しつつ上位を選択する
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
  // 既存タグを「そのまま候補に入れ��」ことで、タグの再利用が自然に起きる。
  // タグが蓄積されるほど「��ンポーネント設計」のような複合語も直接マッチするようになる。
  const existingTags = await tagRepo.findAll();
  if (existingTags.length > 0) {
    await embeddingProvider.buildTagCache(existingTags.map((t) => t.name));
    for (const tag of existingTags) {
      const embedding = await embeddingProvider.embedTag(tag.name);
      candidates.push({ name: tag.name, embedding, score: score(embedding) });
    }
  }

  // Step 2: テキストから内容語を抽出してスコアリング
  // コードブロック内の数式・変数名がノイズ候補になるのを防ぐため、
  // 候補語の抽出はコードブロックを除いたテキストから行う。
  // unigram に加えて1文字漢字バイグラム（ホーナー法、計算量 等）も候補に含める。
  const textForCandidates = stripCodeBlocks(text);
  const contentWords = extractCandidateWords(textForCandidates);
  const existingTagNames = new Set(existingTags.map((t) => t.name));

  for (const word of contentWords) {
    if (existingTagNames.has(word.toLowerCase())) continue;
    const embedding = await embeddingProvider.embedTag(word);
    candidates.push({ name: word, embedding, score: score(embedding) });
  }

  if (candidates.length === 0) return [];

  // Step 3: 相対閾値でフィルタし、MMR で多様性を確保しつつ上位を選択
  const maxScore = Math.max(...candidates.map((c) => c.score));
  const filtered = candidates.filter((c) => c.score >= maxScore * SCORE_CUTOFF_RATIO);
  const selected = mmrSelect(filtered, MAX_TAGS);
  return selected.map((c) => c.name);
}
