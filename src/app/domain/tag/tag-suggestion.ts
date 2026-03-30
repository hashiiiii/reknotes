const DIMENSIONS = 384;

// 正規化済みベクトル同士の cosine similarity = 内積
export function dotProduct(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  for (let i = 0; i < DIMENSIONS; i++) dot += a[i] * b[i];
  return dot;
}
