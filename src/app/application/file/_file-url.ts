// File references belong here while they are persisted as Markdown in note bodies.
// Separate file records would allow URL formatting to move to presentation.
const FILE_URL_PREFIX = "/api/files";

export function buildFileUrl(filename: string): string {
  return `${FILE_URL_PREFIX}/${filename}`;
}

export function buildFileMarkdown(params: { filename: string; originalName: string; contentType: string }): string {
  const url = buildFileUrl(params.filename);
  if (params.contentType.startsWith("video/")) return `<video src="${url}" controls></video>`;
  // Unescaped filename punctuation can break out of the Markdown image's alt text.
  const safeAlt = params.originalName.replace(/[\][()]/g, (c) => `\\${c}`);
  return `![${safeAlt}](${url})`;
}

export function extractUploadedFileKeys(text: string): string[] {
  // A fresh global expression avoids sharing lastIndex if matching methods change later.
  const pattern = new RegExp(`${FILE_URL_PREFIX}/([^\\s)"\\]]+)`, "g");
  return [...text.matchAll(pattern)].map((m) => m[1]);
}
