import { Hono } from "hono";
import type { AppEnv } from "../..";
import { uploadFile } from "../../application/file/upload-file";
import { storageService } from "../../infrastructure/container";

const uploadRoutes = new Hono<AppEnv>();

uploadRoutes.post("/", async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;

  if (!(file instanceof File)) {
    return c.json({ error: "ファイルが選択されていません" }, 400);
  }

  const result = await uploadFile(storageService, file);
  if (!result.ok) {
    return c.json({ error: result.error }, result.status);
  }

  return c.json(result.result);
});

export { uploadRoutes };
