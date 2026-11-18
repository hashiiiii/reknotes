import { Hono } from "hono";
import type { AppEnv } from "../..";
import { getFile } from "../../application/file/get-file";

const fileRoutes = new Hono<AppEnv>();

// Uploaded keys fit this allowlist. Other characters must not escape the quoted
// Content-Disposition filename or inject headers.
function safeFilename(key: string): string {
  return key.replace(/[^A-Za-z0-9._-]/g, "_").replace(/["\r\n]/g, "");
}

fileRoutes.get("/:key", async (c) => {
  const key = c.req.param("key");
  const file = await getFile(c.var.storageProvider, key);

  if (!file) return c.notFound();

  c.header("Content-Type", file.contentType);
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  // Keep file-response protections at the route boundary so a future move to a
  // separate host or CDN retains them (GHSA-g8cw-cxgp-g6r8).
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Content-Disposition", `inline; filename="${safeFilename(key)}"`);
  return c.body(file.body);
});

export { fileRoutes };
