import type { FeatureExtractionPipeline } from "@huggingface/transformers";
import { getDb } from "../db/connection";

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

function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < DIMENSIONS; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-8);
}

// ノートの embedding を生成して保存
export async function upsertNoteEmbedding(noteId: number, title: string, body: string): Promise<void> {
  const text = `${title}\n${body}`.slice(0, 512);
  const embedding = await embedPassage(text);

  const db = getDb();
  db.prepare("INSERT OR REPLACE INTO note_embeddings(note_id, embedding) VALUES (?, ?)").run(
    noteId,
    Buffer.from(embedding.buffer),
  );
}

// タグ推薦：タグ名の embedding とノートの embedding を直接比較
export async function suggestTags(noteId: number, title: string, body: string): Promise<string[]> {
  const db = getDb();
  const text = `${title}\n${body}`.slice(0, 512);
  const noteEmbedding = await embedPassage(text);

  // 全既存タグを取得（note_tags の有無に関係なく）
  const tags = db.prepare("SELECT id, name FROM tags ORDER BY name").all() as { id: number; name: string }[];

  if (tags.length === 0) return [];

  // 各タグ名の embedding とノートの類似度を計算
  const tagScores: { name: string; score: number }[] = [];
  for (const tag of tags) {
    const tagEmb = await embedTag(tag.name);
    tagScores.push({ name: tag.name, score: cosineSimilarity(noteEmbedding, tagEmb) });
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
  const db = getDb();
  const tags = db.prepare("SELECT name FROM tags").all() as { name: string }[];
  for (const tag of tags) {
    await embedTag(tag.name);
  }
  console.log(`Tag embedding cache built: ${tags.length} tags`);
}

// モデルを事前ロード
export async function preload(): Promise<void> {
  await getExtractor();
}

// 全ノートの embedding を一括生成
export async function backfillEmbeddings(): Promise<number> {
  const db = getDb();
  const notes = db
    .prepare(
      `SELECT id, title, body FROM notes
       WHERE id NOT IN (SELECT note_id FROM note_embeddings)`,
    )
    .all() as { id: number; title: string; body: string }[];

  for (const note of notes) {
    await upsertNoteEmbedding(note.id, note.title, note.body);
  }

  return notes.length;
}

// 全ノートのタグを再生成
export async function rebuildAllTags(): Promise<void> {
  const db = getDb();
  const tagService = await import("./tag-service");

  // 全 note_tags をクリア
  db.prepare("DELETE FROM note_tags").run();

  const notes = db.prepare("SELECT id, title, body FROM notes ORDER BY id").all() as {
    id: number;
    title: string;
    body: string;
  }[];

  for (const note of notes) {
    const tags = await suggestTags(note.id, note.title, note.body);
    if (tags.length > 0) tagService.addTagsToNote(note.id, tags);
  }

  // 使われていないタグを削除
  db.prepare("DELETE FROM tags WHERE id NOT IN (SELECT DISTINCT tag_id FROM note_tags)").run();

  // キャッシュを再構築
  tagEmbeddingCache.clear();
  await buildTagCache();
}
