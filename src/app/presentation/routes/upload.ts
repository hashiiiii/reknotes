import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { rateLimiter } from "hono-rate-limiter";
import type { AppEnv } from "../..";
import { uploadFile } from "../../application/file/upload-file";

export function createUploadRoutes() {
  const uploadRoutes = new Hono<AppEnv>();

  // Reject excess uploads before parsing up to 50 MiB (GHSA-72qg-2xg9-547p).
  // A single user needs one quota; forwarding headers are controlled by the caller.
  const uploadLimiter = rateLimiter({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: "draft-7",
    keyGenerator: () => "single-user",
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

  return uploadRoutes;
}
