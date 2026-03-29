import type { IStorageService } from "../../domain/storage/storage-service";

const ALLOWED_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "video/mp4",
  "video/webm",
];
const MAX_SIZE = 50 * 1024 * 1024;

export interface UploadResult {
  url: string;
  markdown: string;
  filename: string;
}

export async function uploadFile(
  storageService: IStorageService,
  file: File,
): Promise<{ ok: true; result: UploadResult } | { ok: false; error: string; status: 400 }> {
  if (!ALLOWED_TYPES.includes(file.type)) {
    return { ok: false, error: "対応していないファイル形式です", status: 400 };
  }
  if (file.size > MAX_SIZE) {
    return { ok: false, error: "ファイルサイズが大きすぎます（上限50MB）", status: 400 };
  }

  const ext = file.name.split(".").pop() || "bin";
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const buffer = new Uint8Array(await file.arrayBuffer());
  await storageService.upload(filename, buffer, file.type);

  const url = `/api/files/${filename}`;
  const isVideo = file.type.startsWith("video/");
  const markdown = isVideo ? `<video src="${url}" controls></video>` : `![${file.name}](${url})`;

  return { ok: true, result: { url, markdown, filename } };
}
