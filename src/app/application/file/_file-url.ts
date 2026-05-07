// アップロードされたファイルの URL/markdown を構築・抽出する処理を一箇所に集める。
// note 本文に markdown として永続化される都合で application 層に置いているが、
// 将来的にファイル参照を別テーブルに分離した場合は presentation 層に移すのが自然。
const FILE_URL_PREFIX = "/api/files";

export function buildFileUrl(filename: string): string {
  return `${FILE_URL_PREFIX}/${filename}`;
}

export function buildFileMarkdown(params: { filename: string; originalName: string; contentType: string }): string {
  const url = buildFileUrl(params.filename);
  if (params.contentType.startsWith("video/")) return `<video src="${url}" controls></video>`;
  // markdown の alt テキスト内に裸の `[ ] ( )` があると画像構文の境界が破綻するので、
  // ユーザー由来のファイル名はバックスラッシュでエスケープしてから埋め込む。
  const safeAlt = params.originalName.replace(/[\][()]/g, (c) => `\\${c}`);
  return `![${safeAlt}](${url})`;
}

export function extractUploadedFileKeys(text: string): string[] {
  // 正規表現を関数スコープで都度生成する。モジュールスコープに `/g` 付きで保持すると、
  // 将来 `exec` / `test` で再利用された際に `lastIndex` のリセット忘れによる誤動作を招きうる。
  const pattern = new RegExp(`${FILE_URL_PREFIX}/([^\\s)"\\]]+)`, "g");
  return [...text.matchAll(pattern)].map((m) => m[1]);
}
