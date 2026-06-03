// ID パスパラメータ/クエリの検証を一箇所に集める。
// route で `Number(...)` をそのまま使うと "abc" -> NaN が repository まで到達し、
// 0 件マッチで 404 になってしまう。正の整数だけを通し、それ以外は null を返して
// route 側で 400 を返せるようにする。
export function parseId(value: string | undefined): number | null {
  if (value === undefined) return null;
  const n = Number(value);
  // NaN / Infinity / 小数 / 0 以下 / MAX_SAFE_INTEGER 超過をすべて弾く。
  if (!Number.isInteger(n) || n <= 0 || n > Number.MAX_SAFE_INTEGER) return null;
  return n;
}
