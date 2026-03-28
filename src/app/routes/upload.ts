import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { Hono } from "hono";
import type { AppEnv } from "..";

const uploadRoutes = new Hono<AppEnv>();

const UPLOAD_DIR = join(process.cwd(), "public", "uploads");

// アップロードディレクトリを初期化
await mkdir(UPLOAD_DIR, { recursive: true });

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

  // ファイルを保存
  const filepath = join(UPLOAD_DIR, filename);
  const buffer = await file.arrayBuffer();
  await Bun.write(filepath, buffer);

  const url = `/static/uploads/${filename}`;
  const isVideo = file.type.startsWith("video/");

  // Markdown 記法を返す
  const markdown = isVideo ? `<video src="${url}" controls></video>` : `![${file.name}](${url})`;

  return c.json({ url, markdown, filename });
});

export { uploadRoutes };
