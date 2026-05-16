// アップロード時の受け入れ判定と、配信時の content-type 再検証で共有する。
// S3 metadata 上の content-type を信用せず、配信側でも同じ allowlist で検証する。
export const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
] as const;

export function isAllowedContentType(contentType: string): boolean {
  return (ALLOWED_TYPES as readonly string[]).includes(contentType);
}
