import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Hono } from "hono";
import type { AppEnv } from "..";

const uploadRoutes = new Hono<AppEnv>();

if (!process.env.R2_ENDPOINT) throw new Error("R2_ENDPOINT is not set");

const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID ?? "",
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY ?? "",
  },
  forcePathStyle: true,
});

uploadRoutes.post("/", async (c) => {
  const body = await c.req.parseBody();
  const file = body.file;

  if (!(file instanceof File)) {
    return c.json({ error: "ファイルが選択されていません" }, 400);
  }

  // 許可するMIMEタイプ
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "video/mp4",
    "video/webm",
  ];

  if (!allowedTypes.includes(file.type)) {
    return c.json({ error: "対応していないファイル形式です" }, 400);
  }

  // サイズ制限: 50MB
  const MAX_SIZE = 50 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return c.json({ error: "ファイルサイズが大きすぎます（上限50MB）" }, 400);
  }

  // ユニークなファイル名を生成
  const ext = file.name.split(".").pop() || "bin";
  const timestamp = Date.now();
  const random = Math.random().toString(36).slice(2, 8);
  const filename = `${timestamp}-${random}.${ext}`;

  const buffer = await file.arrayBuffer();
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME,
      Key: filename,
      Body: new Uint8Array(buffer),
      ContentType: file.type,
    }),
  );

  const url = `/api/files/${filename}`;
  const isVideo = file.type.startsWith("video/");
  const markdown = isVideo ? `<video src="${url}" controls></video>` : `![${file.name}](${url})`;

  return c.json({ url, markdown, filename });
});

export { uploadRoutes };
