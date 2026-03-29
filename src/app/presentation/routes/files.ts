import { Hono } from "hono";
import type { AppEnv } from "../..";
import { getFile } from "../../application/file/get-file";
import { storageService } from "../../infrastructure/container";

const fileRoutes = new Hono<AppEnv>();

fileRoutes.get("/:key", async (c) => {
  const key = c.req.param("key");
  const file = await getFile(storageService, key);

  if (!file) return c.notFound();

  return new Response(file.body, {
    headers: {
      "Content-Type": file.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

export { fileRoutes };
