// CLI / script から呼ばれる use case 専用の戻り値型 (migration, backup 等)。
// kind は ok / error の 2 値のみ、詳細は message に文字列で詰める。
// 呼び出し側 (CLI adapter) は kind で exit code を分けるだけで、追加の整形を一切しない。
// view 系 use case (note, graph, search 等) は生のドメイン値を返し、エラーは throw する方針なのでこの型は使わない。
export type Result = { kind: "ok"; message: string } | { kind: "error"; message: string };

export function ok(message: string): Result {
  return { kind: "ok", message };
}

export function err(message: string): Result {
  return { kind: "error", message };
}
