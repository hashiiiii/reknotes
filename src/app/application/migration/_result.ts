// 全 use case の戻り値型。kind は ok / error の 2 値のみ、詳細は message に文字列で詰める。
// CLI 等の呼び出し側は kind で exit code を分けるだけで、追加の整形を一切しない。
export type Result = { kind: "ok"; message: string } | { kind: "error"; message: string };

export function ok(message: string): Result {
  return { kind: "ok", message };
}

export function err(message: string): Result {
  return { kind: "error", message };
}
