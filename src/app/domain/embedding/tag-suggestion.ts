const DIMENSIONS = 384;

export interface TagScore {
  name: string;
  score: number;
}

// 正規化済みベクトル同士の cosine similarity = 内積
export function dotProduct(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < DIMENSIONS; i++) dot += a[i] * b[i];
  return dot;
}

// mean + 2σ の閾値でタグを絞り込み、上位5件を返す
export function filterTagsByThreshold(tagScores: TagScore[]): string[] {
  if (tagScores.length === 0) return [];

  const scores = tagScores.map((t) => t.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const std = Math.sqrt(scores.reduce((a, b) => a + (b - mean) ** 2, 0) / scores.length);
  const threshold = mean + 2 * std;

  return tagScores
    .sort((a, b) => b.score - a.score)
    .filter((t) => t.score >= threshold)
    .slice(0, 5)
    .map((t) => t.name);
}

// タイトルからキーワードを抽出して新規タグ候補にする（フォールバック用）
export function extractKeywordsFromTitle(title: string): string[] {
  return title
    .split(/[\s、,・／/()（）\-—]+/)
    .map((w) => w.replace(/[。．.!！?？「」『』【】]/g, "").trim())
    .filter((w) => w.length >= 2 && w.length <= 20)
    .slice(0, 3);
}
