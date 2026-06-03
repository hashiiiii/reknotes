// アップロード時の受け入れ判定と、配信時の content-type 再検証で共有する。
// S3 metadata 上の content-type を信用せず、配信側でも同じ allowlist で検証する。
// SVG は同一オリジンの /api/files から配信した瞬間にスクリプトが実行されうるため
// 許可しない (GHSA-j2m9-c6gf-6vfx)。
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm"] as const;

export function isAllowedContentType(contentType: string): boolean {
  return (ALLOWED_TYPES as readonly string[]).includes(contentType);
}
