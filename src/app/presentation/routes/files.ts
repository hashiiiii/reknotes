import { Hono } from "hono";
import type { AppEnv } from "../..";
import { getFile } from "../../application/file/get-file";

const fileRoutes = new Hono<AppEnv>();

// Content-Disposition の filename パラメータに直接埋めても安全な文字だけ許可する。
// upload-file.ts は `${Date.now()}-${random}.${ext}` の形式で key を生成するので
// 通常はこの allowlist でそのまま通る。それ以外の文字は `_` に置換し、最後に
// 二重引用符と CR/LF を確実に取り除いてヘッダ injection を防ぐ。
function safeFilename(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, "_").replace(/["\r\n]/g, "");
}

fileRoutes.get("/:key", async (c) => {
  const key = c.req.param("key");
  const file = await getFile(c.var.storageProvider, key);

  if (!file) return c.notFound();

  c.header("Content-Type", file.contentType);
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  // GHSA-g8cw-cxgp-g6r8: route 側で nosniff と Content-Disposition を明示する。
  // secureHeaders ミドルウェアと冗長になるが、ファイル配信は将来的に別ホストや
  // CDN へ移す可能性があるので route 単位で固める。
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Content-Disposition", `inline; filename="${safeFilename(key)}"`);
  return c.body(file.body);
});

export { fileRoutes };
