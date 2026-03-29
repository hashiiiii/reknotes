import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Hono } from "hono";
import type { AppEnv } from "..";

const fileRoutes = new Hono<AppEnv>();

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
});

fileRoutes.get("/:key", async (c) => {
  const key = c.req.param("key");

  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME,
    Key: key,
  });

  const object = await s3.send(command);

  if (!object.Body) return c.notFound();

  return new Response(object.Body.transformToWebStream(), {
    headers: {
      "Content-Type": object.ContentType ?? "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
});

export { fileRoutes };
