import { Hono } from "hono";
import type { AppEnv } from "../..";
import { getFile } from "../../application/file/get-file";

const fileRoutes = new Hono<AppEnv>();

fileRoutes.get("/:key", async (c) => {
  const key = c.req.param("key");
  const file = await getFile(c.var.storageProvider, key);

  if (!file) return c.notFound();

  c.header("Content-Type", file.contentType);
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  return c.body(file.body);
});

export { fileRoutes };
