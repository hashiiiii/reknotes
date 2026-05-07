// アップロードされたファイルの URL/markdown を構築・抽出する処理を一箇所に集める。
// note 本文に markdown として永続化される都合で application 層に置いているが、
// 将来的にファイル参照を別テーブルに分離した場合は presentation 層に移すのが自然。
const FILE_URL_PREFIX = "/api/files";
const FILE_KEY_PATTERN = /\/api\/files\/([^\s)"\]]+)/g;

export function buildFileUrl(filename: string): string {
  return `${FILE_URL_PREFIX}/${filename}`;
}

export function buildFileMarkdown(params: { filename: string; originalName: string; contentType: string }): string {
  const url = buildFileUrl(params.filename);
  const isVideo = params.contentType.startsWith("video/");
  return isVideo ? `<video src="${url}" controls></video>` : `![${params.originalName}](${url})`;
}

export function extractUploadedFileKeys(text: string): string[] {
  return [...text.matchAll(FILE_KEY_PATTERN)].map((m) => m[1]);
}
