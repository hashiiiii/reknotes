// Reuse this allowlist when serving files because S3 content-type metadata is untrusted.
// SVG can execute scripts on the application's origin and must remain disallowed
// (GHSA-j2m9-c6gf-6vfx).
export const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4", "video/webm"] as const;

export function isAllowedContentType(contentType: string): boolean {
  return (ALLOWED_TYPES as readonly string[]).includes(contentType);
}
