import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import * as noteRepo from "../repositories/note-repository";
import * as tagRepo from "../repositories/tag-repository";

const MODEL_NAME = "Xenova/multilingual-e5-small";
const DIMENSIONS = 384;

let extractor: FeatureExtractionPipeline | null = null;
let loading: Promise<FeatureExtractionPipeline> | null = null;

// タグ名 embedding のキャッシュ（query: プレフィックス）
const tagEmbeddingCache = new Map<string, Float32Array>();

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (extractor) return extractor;
  if (loading) return loading;

  loading = (async () => {
    const { pipeline, env } = await import("@huggingface/transformers");
    env.allowRemoteModels = true;
    env.allowLocalModels = true;
    // @ts-expect-error -- pipeline() overloads produce a union too complex for TS
    extractor = await pipeline("feature-extraction", MODEL_NAME, {
      dtype: "fp32",
    });
    console.log(`Embedding model loaded: ${MODEL_NAME}`);
    return extractor;
  })();

  return loading;
}

// ノート本文用の embedding（passage: プレフィックス）
async function embedPassage(text: string): Promise<Float32Array> {
  const ext = await getExtractor();
  const output = await ext(`passage: ${text}`, { pooling: "mean", normalize: true });
  return new Float32Array(output.data as Float64Array);
}

// タグ名用の embedding（query: プレフィックス、キャッシュあり）
async function embedTag(tagName: string): Promise<Float32Array> {
  const cached = tagEmbeddingCache.get(tagName);
  if (cached) return cached;

  const ext = await getExtractor();
  const output = await ext(`query: ${tagName}`, { pooling: "mean", normalize: true });
  const emb = new Float32Array(output.data as Float64Array);
  tagEmbeddingCache.set(tagName, emb);
  return emb;
}

// 正規化済みベクトル同士の cosine similarity = 内積
function dotProduct(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < DIMENSIONS; i++) dot += a[i] * b[i];
  return dot;
}

// タグ推薦：タグ名の embedding とノートの embedding を直接比較
export async function suggestTags(title: string, body: string): Promise<string[]> {
  const text = `${title}\n${body}`.slice(0, 512);
  const noteEmbedding = await embedPassage(text);

  // 全既存タグを取得（note_tags の有無に関係なく）
  const tags = await tagRepo.findAllNames();

  if (tags.length === 0) return [];

  // 各タグ名の embedding とノートの類似度を計算
  const tagScores: { name: string; score: number }[] = [];
  for (const tag of tags) {
    const tagEmb = await embedTag(tag.name);
    tagScores.push({ name: tag.name, score: dotProduct(noteEmbedding, tagEmb) });
  }

  // mean + 2σ の閾値で上位タグを採用
  const scores = tagScores.map((t) => t.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const std = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
  const threshold = mean + 2 * std;

  const suggested = tagScores
    .sort((a, b) => b.score - a.score)
    .filter((t) => t.score >= threshold)
    .slice(0, 5)
    .map((t) => t.name);

  // 既存タグに該当がなければ、タイトルからキーワードを新規タグとして生成
  if (suggested.length === 0 && title.trim()) {
    const newTags = extractKeywordsFromTitle(title);
    for (const name of newTags) {
      const tagEmb = await embedTag(name);
      tagEmbeddingCache.set(name, tagEmb);
    }
    return newTags;
  }

  return suggested;
}

// タイトルからキーワードを抽出して新規タグ候補にする
function extractKeywordsFromTitle(title: string): string[] {
  return title
    .split(/[\s、,・／/()（）\-—]+/)
    .map((w) => w.replace(/[。．.!！?？「」『』【】]/g, "").trim())
    .filter((w) => w.length >= 2 && w.length <= 20)
    .slice(0, 3);
}

// 起動時にタグ embedding キャッシュを構築
export async function buildTagCache(): Promise<void> {
  const tags = await tagRepo.findAllNames();
  for (const tag of tags) {
    await embedTag(tag.name);
  }
  console.log(`Tag embedding cache built: ${tags.length} tags`);
}

// モデルを事前ロード
export async function preload(): Promise<void> {
  await getExtractor();
}

// 全ノートのタグを再生成
export async function rebuildAllTags(): Promise<void> {
  const tagService = await import("./tag-service");

  // 全 note_tags をクリア
  await tagRepo.deleteAllNoteTagLinks();

  const allNotes = await noteRepo.findAll();

  for (const note of allNotes) {
    const tags = await suggestTags(note.title, note.body);
    if (tags.length > 0) await tagService.addTagsToNote(note.id, tags);
  }

  // キャッシュを再構築
  tagEmbeddingCache.clear();
  await buildTagCache();
}
