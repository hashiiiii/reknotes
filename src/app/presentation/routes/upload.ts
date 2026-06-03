import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { rateLimiter } from "hono-rate-limiter";
import type { AppEnv } from "../..";
import { uploadFile } from "../../application/file/upload-file";

const uploadRoutes = new Hono<AppEnv>();

// GHSA-72qg-2xg9-547p: 50MB の body parsing が走る前に弾くため、bodyLimit より先に評価する。
// 値は advisory の例 (10 req/min) をそのまま採用。
const uploadLimiter = rateLimiter({
  windowMs: 60_000,
  limit: 10,
  standardHeaders: "draft-7",
  keyGenerator: (c) => c.req.header("x-forwarded-for") ?? "anonymous",
});

uploadRoutes.post("/", uploadLimiter, bodyLimit({ maxSize: 50 * 1024 * 1024 }), async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;

  if (!(file instanceof File)) {
    return c.json({ error: "ファイルが選択されていません" }, 400);
  }

  const result = await uploadFile(c.var.storageProvider, file);
  if (!result.ok) {
    return c.json({ error: result.error }, 400);
  }

  return c.json(result.result);
});

export { uploadRoutes };
